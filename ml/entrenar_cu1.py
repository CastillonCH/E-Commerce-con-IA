"""CU1 — clasificación por imagen: ResNet-50 (cu1-resnet50-v1) y
EfficientNet-B0 (cu1-efficientnet-b0-v1), transfer learning desde ImageNet.

Qué cambia respecto de la corrida anterior (ResNet-50 66% / EfficientNet
59% de accuracy en test) y por qué:
  - Fine-tuning COMPLETO con LR discriminativo (backbone bajo, cabeza 10x),
    en vez de entrenar solo la última capa y después solo layer4 /
    features.8 (en EfficientNet-B0, features.8 es apenas la conv 1x1 final:
    el modelo casi no se adaptaba al dominio de productos).
  - 1 época de warmup + decaimiento coseno (antes StepLR) y hasta 25
    épocas con early stopping (paciencia 5) sobre el F1-macro de validación.
  - Augmentación más fuerte (RandomResizedCrop, TrivialAugmentWide,
    RandomErasing) y una degradación aleatoria de resolución: parte del
    dataset (Fashion Product Images) viene a 60x80 px, y sin esto la red
    puede aprender "foto borrosa = clase de moda" en vez del producto.
  - Label smoothing 0.1 + pesos por clase (raíz de la frecuencia inversa).
  - AMP (fp16) y channels_last en GPU; DataLoader con workers (antes 0:
    la GPU esperaba a que el proceso principal decodificara cada JPEG).
  - Clases en el orden de la taxonomía (indice_clase), no alfabético, y el
    checkpoint se guarda con el formato y la carpeta que carga ai-service.

Uso (PowerShell, desde la carpeta ml):
    .\\.venv\\Scripts\\python.exe entrenar_cu1.py
    .\\.venv\\Scripts\\python.exe entrenar_cu1.py --arquitecturas resnet50
    .\\.venv\\Scripts\\python.exe entrenar_cu1.py --modo-rapido   # prueba de humo
"""

from __future__ import annotations

import argparse
import math
import random
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

from comun import (
    CARPETA_DATOS, CARPETA_MODELOS, CLASES, META_CU1, cargar_particiones, configurar_consola, dispositivo,
    escribir_sql_registro, fijar_semillas, guardar_curvas, guardar_matriz_confusion, guardar_resultados, metricas,
    metricas_por_fuente, pesos_por_clase, resumen,
)

NORMALIZAR = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
# Idéntica a la de ai-service/app/modelos/cargador_imagen.py: lo que se
# mide en validación/test es lo mismo que verá el servicio en producción.
TRANSFORM_EVAL = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(), NORMALIZAR])

CONFIG_ARQUITECTURA = {
    "resnet50": {"codigo": "cu1-resnet50-v1", "lr_backbone": 1e-4, "dim_embedding": 2048},
    "efficientnet_b0": {"codigo": "cu1-efficientnet-b0-v1", "lr_backbone": 3e-4, "dim_embedding": 1280},
}


class BajaResolucionAleatoria:
    """Con probabilidad p reduce la imagen a un lado corto de 48-112 px y
    la vuelve a agrandar: todas las fuentes pasan a verse "a veces
    borrosas", así la resolución deja de delatar de qué dataset vino."""

    def __init__(self, p: float = 0.35, minimo: int = 48, maximo: int = 112):
        self.p, self.minimo, self.maximo = p, minimo, maximo

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() >= self.p:
            return img
        ancho, alto = img.size
        lado = random.randint(self.minimo, self.maximo)
        escala = lado / min(ancho, alto)
        if escala >= 1:
            return img
        pequena = img.resize((max(1, int(ancho * escala)), max(1, int(alto * escala))), Image.BILINEAR)
        return pequena.resize((ancho, alto), Image.BILINEAR)


TRANSFORM_TRAIN = transforms.Compose([
    BajaResolucionAleatoria(),
    transforms.RandomResizedCrop(224, scale=(0.35, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.TrivialAugmentWide(),
    transforms.ToTensor(),
    NORMALIZAR,
    transforms.RandomErasing(p=0.25),
])


class DatasetImagenes(Dataset):
    # Clase de nivel módulo: en Windows los workers del DataLoader se crean
    # con "spawn" y necesitan poder importar el dataset.
    def __init__(self, rutas: list[str], etiquetas: list[int], transform):
        self.rutas, self.etiquetas, self.transform = rutas, etiquetas, transform

    def __len__(self) -> int:
        return len(self.etiquetas)

    def __getitem__(self, i):
        with Image.open(self.rutas[i]) as img:
            return self.transform(img.convert("RGB")), self.etiquetas[i]


def construir(arquitectura: str) -> nn.Module:
    if arquitectura == "resnet50":
        modelo = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
        modelo.fc = nn.Linear(modelo.fc.in_features, len(CLASES))
    else:
        modelo = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        modelo.classifier[1] = nn.Linear(modelo.classifier[1].in_features, len(CLASES))
    return modelo


def es_cabeza(nombre: str) -> bool:
    return nombre.startswith("fc.") or nombre.startswith("classifier.")


def entrenar_arquitectura(arquitectura: str, train, val, test, args, disp: str) -> dict:
    config = CONFIG_ARQUITECTURA[arquitectura]
    codigo = config["codigo"]
    salida = args.salida_base / codigo
    salida.mkdir(parents=True, exist_ok=True)
    usar_amp = disp == "cuda"
    print("\n" + "=" * 70 + f"\n>>> {arquitectura} ({codigo}) en {disp}\n" + "=" * 70, flush=True)

    def cargador(df, transform, barajar):
        return DataLoader(
            DatasetImagenes(df["ruta_imagen"].tolist(), df["etiqueta"].tolist(), transform),
            batch_size=args.batch, shuffle=barajar, num_workers=args.workers,
            pin_memory=usar_amp, persistent_workers=args.workers > 0,
            generator=torch.Generator().manual_seed(42),
        )

    train_loader = cargador(train, TRANSFORM_TRAIN, True)
    val_loader, test_loader = cargador(val, TRANSFORM_EVAL, False), cargador(test, TRANSFORM_EVAL, False)

    modelo = construir(arquitectura).to(disp)
    if usar_amp:
        modelo = modelo.to(memory_format=torch.channels_last)
    lr = args.lr_backbone or config["lr_backbone"]
    grupos = [
        {"params": [p for n, p in modelo.named_parameters() if not es_cabeza(n)], "lr": lr},
        {"params": [p for n, p in modelo.named_parameters() if es_cabeza(n)], "lr": lr * 10},
    ]
    optimizador = torch.optim.AdamW(grupos, weight_decay=0.01)
    pasos_por_epoca = len(train_loader)
    total, warmup = pasos_por_epoca * args.epocas, pasos_por_epoca
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizador,
        lambda paso: (paso + 1) / warmup if paso < warmup else 0.5 * (1 + math.cos(math.pi * (paso - warmup) / max(1, total - warmup))),
    )
    pesos = torch.tensor(pesos_por_clase(train["etiqueta"]), dtype=torch.float32, device=disp)
    criterio = nn.CrossEntropyLoss(weight=pesos, label_smoothing=0.1)
    escalador = torch.amp.GradScaler("cuda", enabled=usar_amp)

    def evaluar(loader):
        modelo.eval()
        probs, y_true, perdida = [], [], 0.0
        with torch.no_grad():
            for entradas, etiquetas in loader:
                entradas, etiquetas = entradas.to(disp, non_blocking=True), etiquetas.to(disp)
                if usar_amp:
                    entradas = entradas.to(memory_format=torch.channels_last)
                with torch.autocast(device_type="cuda", enabled=usar_amp):
                    logits = modelo(entradas).float()
                perdida += nn.functional.cross_entropy(logits, etiquetas, reduction="sum").item()
                probs.append(torch.softmax(logits, 1).cpu())
                y_true.extend(etiquetas.cpu().tolist())
        p = torch.cat(probs).numpy()
        return metricas(y_true, p.argmax(1)), perdida / max(len(y_true), 1), p

    historia = {"epoca": [], "train_loss": [], "val_loss": [], "val_accuracy": [], "val_f1_macro": []}
    mejor_f1, mejor_estado, sin_mejora = -1.0, None, 0
    for epoca in range(1, args.epocas + 1):
        modelo.train()
        inicio, perdida_total, n = time.time(), 0.0, 0
        for entradas, etiquetas in train_loader:
            entradas, etiquetas = entradas.to(disp, non_blocking=True), etiquetas.to(disp, non_blocking=True)
            if usar_amp:
                entradas = entradas.to(memory_format=torch.channels_last)
            optimizador.zero_grad(set_to_none=True)
            with torch.autocast(device_type="cuda", enabled=usar_amp):
                perdida = criterio(modelo(entradas).float(), etiquetas)
            escalador.scale(perdida).backward()
            escalador.unscale_(optimizador)
            torch.nn.utils.clip_grad_norm_(modelo.parameters(), 2.0)
            escalador.step(optimizador)
            escalador.update()
            scheduler.step()
            perdida_total += perdida.item() * len(etiquetas)
            n += len(etiquetas)

        m_val, perdida_val, _ = evaluar(val_loader)
        for clave, valor in (("epoca", epoca), ("train_loss", perdida_total / max(n, 1)), ("val_loss", perdida_val),
                             ("val_accuracy", m_val["accuracy"]), ("val_f1_macro", m_val["f1_macro"])):
            historia[clave].append(valor)
        print(f"  [{arquitectura}] época {epoca}/{args.epocas} | train_loss={historia['train_loss'][-1]:.4f} "
              f"| val_loss={perdida_val:.4f} | val_acc={m_val['accuracy']:.4f} | val_f1={m_val['f1_macro']:.4f} "
              f"| {time.time() - inicio:.0f}s", flush=True)
        if m_val["f1_macro"] > mejor_f1:
            mejor_f1, sin_mejora = m_val["f1_macro"], 0
            mejor_estado = {k: v.detach().cpu().clone() for k, v in modelo.state_dict().items()}
            # Checkpoint en disco en cada mejora: si se corta la luz o se
            # cierra la terminal, no se pierde lo mejor hasta ahí.
            torch.save({"modelo": mejor_estado, "clases": CLASES, "arquitectura": arquitectura}, salida / "modelo.pt")
        else:
            sin_mejora += 1
            if sin_mejora >= args.paciencia:
                print(f"  [early stopping] sin mejora en {args.paciencia} épocas")
                break

    modelo.load_state_dict(mejor_estado)
    m_test, _, probs_test = evaluar(test_loader)
    _, _, probs_val = evaluar(val_loader)
    y_pred = probs_test.argmax(1)
    por_fuente = metricas_por_fuente(test, y_pred)
    print("\n" + resumen(f"{arquitectura} (test)", m_test, META_CU1))
    for fuente, valores in por_fuente.items():
        print(f"  {fuente:12} n={valores['n']:4} acc={valores['accuracy']:.4f} f1(clases presentes)={valores['f1_macro_clases_presentes']:.4f}")

    torch.save({"modelo": mejor_estado, "clases": CLASES, "arquitectura": arquitectura}, salida / "modelo.pt")
    np.save(salida / "probs_val.npy", probs_val)
    np.save(salida / "probs_test.npy", probs_test)
    hiper = {"arquitectura": arquitectura, "lr_backbone": lr, "lr_cabeza": lr * 10, "batch": args.batch,
             "epocas_max": args.epocas, "epocas_corridas": len(historia["epoca"]), "paciencia": args.paciencia,
             "label_smoothing": 0.1, "scheduler": "warmup 1 época + coseno", "weight_decay": 0.01,
             "augmentacion": "RandomResizedCrop(0.35-1)+Flip+TrivialAugmentWide+RandomErasing+baja resolución aleatoria"}
    guardar_resultados(salida, m_test, {"por_fuente": por_fuente, "hiperparametros": hiper, "val_f1_macro": mejor_f1,
                                        "modo_rapido": args.modo_rapido})
    guardar_matriz_confusion(test["etiqueta"], y_pred, salida / "matriz_confusion.png")
    guardar_curvas(historia, salida / "curvas_entrenamiento.png", arquitectura)
    escribir_sql_registro(salida, codigo, m_test, hiper, f"{codigo}/modelo.pt")
    return m_test


def main() -> None:
    configurar_consola()
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", type=Path, default=CARPETA_DATOS)
    parser.add_argument("--salida-base", type=Path, default=CARPETA_MODELOS)
    parser.add_argument("--arquitecturas", nargs="+", default=["resnet50", "efficientnet_b0"], choices=list(CONFIG_ARQUITECTURA))
    parser.add_argument("--epocas", type=int, default=25)
    parser.add_argument("--paciencia", type=int, default=5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr-backbone", type=float, default=None, help="Por defecto 1e-4 (ResNet-50) / 3e-4 (EfficientNet-B0).")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--modo-rapido", action="store_true", help="Pocas imágenes y 1 época, solo para probar que corre.")
    args = parser.parse_args()

    fijar_semillas()
    disp = dispositivo()
    train, val, test = cargar_particiones(args.datos)
    if args.modo_rapido:
        train = train.groupby("categoria", group_keys=False).head(3)
        val = val.groupby("categoria", group_keys=False).head(2)
        test = test.groupby("categoria", group_keys=False).head(2)
        args.epocas, args.workers = 1, 0
    print(f"[DATOS] train={len(train)} | val={len(val)} | test={len(test)} | dispositivo={disp}")
    if disp == "cuda":
        print(f"[GPU] {torch.cuda.get_device_name(0)}")

    resultados = {a: entrenar_arquitectura(a, train, val, test, args, disp) for a in args.arquitecturas}
    print("\n" + "=" * 70)
    for arquitectura, m in resultados.items():
        print(resumen(f"{arquitectura:16}", m, META_CU1))
    if args.modo_rapido:
        print("\n[MODO RÁPIDO] Estas métricas NO son válidas: solo confirman que el script corre.")


if __name__ == "__main__":
    main()
