"""
Script de entrenamiento CU1 - ResNet-50 + EfficientNet-B0
Ejecuta directamente la arquitectura y logica del notebook 03_cu1_imagen.ipynb
usando la GPU local (RTX 4060, CUDA 12.4).
"""

import sys
import io
import argparse
import json
import random
from pathlib import Path

# Configurar encoding UTF-8 seguro para Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import torch
from torch import nn
from torchvision import models, transforms
from torch.utils.data import DataLoader, Dataset
from PIL import Image
from sklearn.metrics import accuracy_score, f1_score
import pandas as pd
import matplotlib.pyplot as plt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--modo-rapido", action="store_true",
                        help="Usa datos de prueba reducidos para verificar que el pipeline corre sin errores")
    parser.add_argument("--max-por-clase", type=int, default=300,
                        help="Maximo de ejemplos por clase a descargar (300 por defecto)")
    args = parser.parse_args()

    MODO_RAPIDO: bool = args.modo_rapido
    SEMILLA = 42
    CARPETA_ML = Path(__file__).resolve().parent
    CARPETA_DATOS = CARPETA_ML / "datos"
    CARPETA_MODELOS = CARPETA_ML / "modelos" / "cu1-imagen"
    CARPETA_MODELOS.mkdir(parents=True, exist_ok=True)

    random.seed(SEMILLA)
    np.random.seed(SEMILLA)
    torch.manual_seed(SEMILLA)

    DISPOSITIVO = "cuda" if torch.cuda.is_available() else "cpu"
    print("=" * 60)
    print(f"MODO_RAPIDO = {MODO_RAPIDO}")
    print(f"Dispositivo : {DISPOSITIVO}")
    if DISPOSITIVO == "cuda":
        print(f"GPU         : {torch.cuda.get_device_name(0)}")
        print(f"VRAM        : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print("=" * 60)

    # 1. Preparar o cargar dataset
    if MODO_RAPIDO:
        from _modo_rapido_fallback import generar_si_falta
        generar_si_falta(CARPETA_DATOS, por_clase=5)
    else:
        if not (CARPETA_DATOS / "train.csv").exists():
            print("\n[INFO] No se encontro train.csv. Descargando y procesando dataset de Shopify/product-catalogue...")
            sys.path.insert(0, str(CARPETA_ML))
            from preparar_dataset import construir_dataset, particionar, guardar_particion
            df = construir_dataset(
                max_por_clase=args.max_por_clase,
                limite_filas=None,
                carpeta_salida=CARPETA_DATOS,
            )
            if "texto_es" not in df.columns:
                df["texto_es"] = df["titulo"] + " " + df["descripcion"].fillna("")
            train_df, val_df, test_df = particionar(df, seed=SEMILLA, estratificar=True)
            guardar_particion(train_df, val_df, test_df, carpeta=CARPETA_DATOS)
            print("[INFO] Dataset descargado y particionado exitosamente.")

    train = pd.read_csv(CARPETA_DATOS / "train.csv")
    val   = pd.read_csv(CARPETA_DATOS / "val.csv")
    test  = pd.read_csv(CARPETA_DATOS / "test.csv")

    if MODO_RAPIDO:
        train = train.groupby("categoria", group_keys=False).head(5)
        val   = val.groupby("categoria", group_keys=False).head(2)
        test  = test.groupby("categoria", group_keys=False).head(2)

    print(f"\n[DATOS] train={len(train)} | val={len(val)} | test={len(test)}")

    # 2. Transformaciones y Datasets
    TRANSFORM_TRAIN = transforms.Compose([
        transforms.RandomResizedCrop(224),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    TRANSFORM_EVAL = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    CLASES = sorted(train["categoria"].unique())
    LABEL2ID = {c: i for i, c in enumerate(CLASES)}
    print(f"[CLASES] {len(CLASES)} categorias detectadas:")
    for i, c in enumerate(CLASES):
        print(f"  [{i:>2}] {c}")

    class DatasetImagenes(Dataset):
        def __init__(self, df, transform):
            self.rutas = df["ruta_imagen"].tolist()
            self.etiquetas = df["categoria"].map(LABEL2ID).tolist()
            self.transform = transform

        def __len__(self):
            return len(self.etiquetas)

        def __getitem__(self, idx):
            img = Image.open(self.rutas[idx]).convert("RGB")
            return self.transform(img), self.etiquetas[idx]

    BATCH_SIZE = 32 if (DISPOSITIVO == "cuda") else 16
    train_loader = DataLoader(DatasetImagenes(train, TRANSFORM_TRAIN), batch_size=BATCH_SIZE, shuffle=True, num_workers=0, pin_memory=(DISPOSITIVO=="cuda"))
    val_loader   = DataLoader(DatasetImagenes(val,   TRANSFORM_EVAL),  batch_size=BATCH_SIZE, num_workers=0, pin_memory=(DISPOSITIVO=="cuda"))
    test_loader  = DataLoader(DatasetImagenes(test,  TRANSFORM_EVAL),  batch_size=BATCH_SIZE, num_workers=0, pin_memory=(DISPOSITIVO=="cuda"))

    # 3. Funciones de evaluacion y entrenamiento
    def evaluar(modelo, loader):
        modelo.eval()
        criterio = nn.CrossEntropyLoss()
        y_true, y_pred, perdida_total, n = [], [], 0.0, 0
        with torch.no_grad():
            for entradas, etiquetas in loader:
                entradas, etiquetas = entradas.to(DISPOSITIVO), etiquetas.to(DISPOSITIVO)
                logits = modelo(entradas)
                perdida_total += criterio(logits, etiquetas).item() * len(etiquetas)
                n += len(etiquetas)
                y_pred.extend(logits.argmax(dim=1).cpu().tolist())
                y_true.extend(etiquetas.cpu().tolist())
        return {
            "loss": perdida_total / max(n, 1),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        }

    def entrenar(modelo, nombre, epocas_cabeza, epocas_finetune):
        criterio = nn.CrossEntropyLoss()
        historia = {"epoca": [], "fase": [], "train_loss": [], "val_loss": [], "val_accuracy": [], "val_f1_macro": []}
        mejor_f1, mejor_estado, epoca_global = -1.0, None, 0

        for fase, epocas, lr in [("cabeza", epocas_cabeza, 1e-3), ("fine-tune", epocas_finetune, 1e-4)]:
            if fase == "fine-tune":
                for nombre_param, param in modelo.named_parameters():
                    if "layer4" in nombre_param or "features.8" in nombre_param or "fc" in nombre_param or "classifier" in nombre_param:
                        param.requires_grad = True
            entrenables = [p for p in modelo.parameters() if p.requires_grad]
            optimizador = torch.optim.AdamW(entrenables, lr=lr)
            scheduler = torch.optim.lr_scheduler.StepLR(optimizador, step_size=max(epocas // 2, 1), gamma=0.5)
            epocas_sin_mejora = 0

            for ep in range(epocas):
                epoca_global += 1
                modelo.train()
                perdida_total, n = 0.0, 0
                for entradas, etiquetas in train_loader:
                    entradas, etiquetas = entradas.to(DISPOSITIVO), etiquetas.to(DISPOSITIVO)
                    optimizador.zero_grad()
                    perdida = criterio(modelo(entradas), etiquetas)
                    perdida.backward()
                    optimizador.step()
                    perdida_total += perdida.item() * len(etiquetas)
                    n += len(etiquetas)
                scheduler.step()

                m = evaluar(modelo, val_loader)
                historia["epoca"].append(epoca_global)
                historia["fase"].append(fase)
                historia["train_loss"].append(perdida_total / max(n, 1))
                historia["val_loss"].append(m["loss"])
                historia["val_accuracy"].append(m["accuracy"])
                historia["val_f1_macro"].append(m["f1_macro"])
                print(f"  [{nombre}] {fase} epoca {epoca_global} | "
                      f"train_loss={historia['train_loss'][-1]:.4f} | "
                      f"val_acc={m['accuracy']:.4f} | val_f1={m['f1_macro']:.4f}")

                if m["f1_macro"] > mejor_f1 or mejor_estado is None:
                    mejor_f1 = m["f1_macro"]
                    mejor_estado = {k: v.cpu().clone() for k, v in modelo.state_dict().items()}
                    epocas_sin_mejora = 0
                    torch.save({"modelo": mejor_estado, "clases": CLASES},
                               CARPETA_MODELOS / f"checkpoint_{nombre}.pt")
                    print(f"    -> [CHECKPOINT] Mejor f1_macro={mejor_f1:.4f} guardado.")
                else:
                    epocas_sin_mejora += 1
                    if epocas_sin_mejora >= 2:
                        print(f"    [EARLY STOPPING] {nombre} en fase {fase}")
                        break

        modelo.load_state_dict(mejor_estado)
        return modelo, historia, mejor_f1

    EPOCAS_CABEZA = 1 if MODO_RAPIDO else 4
    EPOCAS_FINETUNE = 1 if MODO_RAPIDO else 6

    # 4. Entrenar ResNet-50
    print("\n" + "=" * 60)
    print(">>> 1/2 Entrenando ResNet-50 (cu1-resnet50-v1)...")
    print("=" * 60)
    resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
    for p in resnet.parameters():
        p.requires_grad = False
    resnet.fc = nn.Linear(resnet.fc.in_features, len(CLASES))
    resnet = resnet.to(DISPOSITIVO)
    resnet, historia_resnet, f1_resnet = entrenar(resnet, "resnet50", EPOCAS_CABEZA, EPOCAS_FINETUNE)

    # 5. Entrenar EfficientNet-B0
    print("\n" + "=" * 60)
    print(">>> 2/2 Entrenando EfficientNet-B0 (cu1-efficientnet-b0-v1)...")
    print("=" * 60)
    efficientnet = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    for p in efficientnet.parameters():
        p.requires_grad = False
    efficientnet.classifier[1] = nn.Linear(efficientnet.classifier[1].in_features, len(CLASES))
    efficientnet = efficientnet.to(DISPOSITIVO)
    efficientnet, historia_efficientnet, f1_efficientnet = entrenar(
        efficientnet, "efficientnet_b0", EPOCAS_CABEZA, EPOCAS_FINETUNE
    )

    # 6. Evaluacion sobre conjunto de prueba (TEST)
    print("\n" + "=" * 60)
    print(">>> Evaluando sobre conjunto de PRUEBA (TEST)...")
    print("=" * 60)
    metricas_resnet = evaluar(resnet, test_loader)
    metricas_efficientnet = evaluar(efficientnet, test_loader)

    tabla = pd.DataFrame({
        "modelo": ["ResNet-50", "EfficientNet-B0"],
        "val_f1_macro": [f1_resnet, f1_efficientnet],
        "test_accuracy": [metricas_resnet["accuracy"], metricas_efficientnet["accuracy"]],
        "test_f1_macro": [metricas_resnet["f1_macro"], metricas_efficientnet["f1_macro"]],
    })
    print("\n" + tabla.to_string(index=False))

    # 7. Guardar modelos y metricas
    print("\n[GUARDAR] Guardando modelos y metricas...")
    for nombre, modelo, metricas_test in [
        ("resnet50", resnet, metricas_resnet),
        ("efficientnet_b0", efficientnet, metricas_efficientnet),
    ]:
        torch.save({"modelo": modelo.state_dict(), "clases": CLASES, "arquitectura": nombre},
                   CARPETA_MODELOS / f"{nombre}.pt")
        with open(CARPETA_MODELOS / f"metricas_{nombre}.json", "w", encoding="utf-8") as f:
            json.dump(metricas_test, f, indent=2)
        print(f"  [OK] Guardado {CARPETA_MODELOS / f'{nombre}.pt'}")

    # Copiar el mejor modelo para el ai-service si existe la carpeta
    carpeta_ai_service = CARPETA_ML.parent / "ai-service" / "app" / "modelos"
    if carpeta_ai_service.exists():
        torch.save({"modelo": resnet.state_dict(), "clases": CLASES, "arquitectura": "resnet50"},
                   carpeta_ai_service / "resnet50.pt")
        print(f"  [OK] Copiado resnet50.pt a {carpeta_ai_service}")

    # 8. Guardar graficas de entrenamiento
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    for historia, nombre in [(historia_resnet, "ResNet-50"), (historia_efficientnet, "EfficientNet-B0")]:
        ax1.plot(historia["epoca"], historia["train_loss"], label=f"{nombre} train")
        ax2.plot(historia["epoca"], historia["val_f1_macro"], label=nombre)
    ax1.set_title("Perdida de entrenamiento")
    ax1.set_xlabel("Epoca")
    ax1.legend()
    ax2.set_title("F1-macro de validacion")
    ax2.set_xlabel("Epoca")
    ax2.legend()
    plt.tight_layout()
    curvas_path = CARPETA_MODELOS / "curvas_entrenamiento.png"
    plt.savefig(curvas_path, dpi=120)
    print(f"  [OK] Graficas guardadas en {curvas_path}")

    # 9. Generar script SQL para actualizar PostgreSQL
    for nombre_bd, metricas_test in [
        ("cu1-resnet50-v1", metricas_resnet),
        ("cu1-efficientnet-b0-v1", metricas_efficientnet),
    ]:
        sql = f"""UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps(metricas_test)}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = '{nombre_bd.split("-v1")[0]}.pt'
 WHERE codigo = '{nombre_bd}';
"""
        (CARPETA_MODELOS / f"registro_{nombre_bd}.sql").write_text(sql, encoding="utf-8")

    # 10. Resumen de la meta OE1
    mejor_acc = max(metricas_resnet["accuracy"], metricas_efficientnet["accuracy"])
    mejor_f1 = max(metricas_resnet["f1_macro"], metricas_efficientnet["f1_macro"])
    cumple = (mejor_acc >= 0.80 and mejor_f1 >= 0.75)

    print("\n" + "=" * 60)
    print("BALANCE META OE1")
    print(f"  Mejor Accuracy  : {mejor_acc:.4f}  (Meta >= 0.80 -> {'CUMPLE' if mejor_acc >= 0.80 else 'NO CUMPLE'})")
    print(f"  Mejor F1-macro  : {mejor_f1:.4f}  (Meta >= 0.75 -> {'CUMPLE' if mejor_f1 >= 0.75 else 'NO CUMPLE'})")
    print(f"  Estado Final OE1: {'[META CUMPLIDA]' if cumple else '[NO ALCANZADA]'}")
    print("=" * 60)

if __name__ == "__main__":
    main()
