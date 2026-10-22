"""CU2 — fine-tuning de BETO (dccuchile/bert-base-spanish-wwm-cased), cu2-beto-v1.

Por qué la corrida anterior quedó en F1-macro 0.36 (accuracy 0.61) y qué
cambia acá:
  - 4 épocas con lr=2e-5 en ~2 000 ejemplos y 21 clases: la cabeza
    clasificadora (inicializada al azar) no llegaba a aprender las clases
    chicas -> el modelo casi solo predecía las clases grandes (accuracy
    "aceptable", F1-macro muy bajo). Ahora: hasta 15 épocas con early
    stopping (paciencia 3) y la cabeza con una LR 10x mayor que el encoder.
  - Pérdida con pesos por clase (raíz de la frecuencia inversa) + label
    smoothing 0.05, por el desbalance entre clases.
  - weight decay 0.01 (sin bias/LayerNorm), clipping de gradiente 1.0,
    warmup 10% + decaimiento lineal, AMP (fp16) en GPU.
  - Clases en el orden de la taxonomía (indice_clase), no alfabético.
  - Padding dinámico por lote (más rápido que rellenar todo a 128).

Uso (PowerShell, desde la carpeta ml):
    .\\.venv\\Scripts\\python.exe entrenar_cu2_beto.py
    .\\.venv\\Scripts\\python.exe entrenar_cu2_beto.py --modo-rapido   # prueba de humo
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from comun import (
    CARPETA_DATOS, CARPETA_MODELOS, CLASES, LABEL2ID, META_CU2, cargar_particiones, configurar_consola, dispositivo,
    escribir_sql_registro, fijar_semillas, guardar_curvas, guardar_matriz_confusion, guardar_resultados, metricas,
    metricas_por_fuente, pesos_por_clase, resumen,
)

CODIGO = "cu2-beto-v1"
MODELO_BASE = "dccuchile/bert-base-spanish-wwm-cased"


def main() -> None:
    configurar_consola()
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", type=Path, default=CARPETA_DATOS)
    parser.add_argument("--salida", type=Path, default=CARPETA_MODELOS / CODIGO)
    parser.add_argument("--epocas", type=int, default=15)
    parser.add_argument("--paciencia", type=int, default=3)
    parser.add_argument("--lr", type=float, default=3e-5, help="LR del encoder; la cabeza usa 10x.")
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument("--modo-rapido", action="store_true", help="Pocas filas y 1 época, solo para probar que corre.")
    args = parser.parse_args()

    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    fijar_semillas()
    disp = dispositivo()
    usar_amp = disp == "cuda"
    train, val, test = cargar_particiones(args.datos)
    if args.modo_rapido:
        train = train.groupby("categoria", group_keys=False).head(4)
        val = val.groupby("categoria", group_keys=False).head(2)
        test = test.groupby("categoria", group_keys=False).head(2)
        args.epocas = 1
    print(f"[BETO] dispositivo={disp} | train={len(train)} val={len(val)} test={len(test)}")

    tokenizer = AutoTokenizer.from_pretrained(MODELO_BASE)
    modelo = AutoModelForSequenceClassification.from_pretrained(
        MODELO_BASE,
        num_labels=len(CLASES),
        id2label={i: c for i, c in enumerate(CLASES)},
        label2id=LABEL2ID,
    ).to(disp)

    def cargador(df, barajar: bool) -> DataLoader:
        ejemplos = list(zip(df["texto_es"].tolist(), df["etiqueta"].tolist()))

        def juntar(lote):
            textos, etiquetas = zip(*lote)
            entrada = tokenizer(list(textos), truncation=True, max_length=args.max_length, padding=True, return_tensors="pt")
            entrada["labels"] = torch.tensor(etiquetas, dtype=torch.long)
            return entrada

        generador = torch.Generator().manual_seed(42)
        return DataLoader(ejemplos, batch_size=args.batch, shuffle=barajar, collate_fn=juntar, generator=generador)

    train_loader, val_loader, test_loader = cargador(train, True), cargador(val, False), cargador(test, False)

    sin_decay = ("bias", "LayerNorm.weight")
    cabeza = [(n, p) for n, p in modelo.named_parameters() if n.startswith("classifier")]
    encoder = [(n, p) for n, p in modelo.named_parameters() if not n.startswith("classifier")]
    grupos = [
        {"params": [p for n, p in encoder if not any(s in n for s in sin_decay)], "weight_decay": 0.01, "lr": args.lr},
        {"params": [p for n, p in encoder if any(s in n for s in sin_decay)], "weight_decay": 0.0, "lr": args.lr},
        {"params": [p for _, p in cabeza], "weight_decay": 0.01, "lr": args.lr * 10},
    ]
    optimizador = torch.optim.AdamW(grupos)
    total_pasos = len(train_loader) * args.epocas
    scheduler = get_linear_schedule_with_warmup(optimizador, int(total_pasos * 0.1), total_pasos)
    pesos = torch.tensor(pesos_por_clase(train["etiqueta"]), dtype=torch.float32, device=disp)
    criterio = nn.CrossEntropyLoss(weight=pesos, label_smoothing=args.label_smoothing)
    escalador = torch.amp.GradScaler("cuda", enabled=usar_amp)

    def evaluar(loader) -> tuple[dict, float, np.ndarray]:
        modelo.eval()
        probs, y_true, perdida = [], [], 0.0
        with torch.no_grad():
            for lote in loader:
                etiquetas = lote.pop("labels").to(disp)
                lote = {k: v.to(disp) for k, v in lote.items()}
                with torch.autocast(device_type="cuda", enabled=usar_amp):
                    logits = modelo(**lote).logits
                perdida += nn.functional.cross_entropy(logits.float(), etiquetas, reduction="sum").item()
                probs.append(torch.softmax(logits.float(), dim=1).cpu())
                y_true.extend(etiquetas.cpu().tolist())
        p = torch.cat(probs).numpy()
        return metricas(y_true, p.argmax(1)), perdida / max(len(y_true), 1), p

    historia = {"epoca": [], "train_loss": [], "val_loss": [], "val_accuracy": [], "val_f1_macro": []}
    mejor_f1, mejor_estado, sin_mejora = -1.0, None, 0
    for epoca in range(1, args.epocas + 1):
        modelo.train()
        inicio, perdida_total, n = time.time(), 0.0, 0
        for lote in train_loader:
            etiquetas = lote.pop("labels").to(disp)
            lote = {k: v.to(disp) for k, v in lote.items()}
            optimizador.zero_grad(set_to_none=True)
            with torch.autocast(device_type="cuda", enabled=usar_amp):
                perdida = criterio(modelo(**lote).logits.float(), etiquetas)
            escalador.scale(perdida).backward()
            escalador.unscale_(optimizador)
            torch.nn.utils.clip_grad_norm_(modelo.parameters(), 1.0)
            escalador.step(optimizador)
            escalador.update()
            scheduler.step()
            perdida_total += perdida.item() * len(etiquetas)
            n += len(etiquetas)

        m_val, perdida_val, _ = evaluar(val_loader)
        for clave, valor in (("epoca", epoca), ("train_loss", perdida_total / max(n, 1)), ("val_loss", perdida_val),
                             ("val_accuracy", m_val["accuracy"]), ("val_f1_macro", m_val["f1_macro"])):
            historia[clave].append(valor)
        print(f"  época {epoca}/{args.epocas} | train_loss={historia['train_loss'][-1]:.4f} | val_loss={perdida_val:.4f} "
              f"| val_acc={m_val['accuracy']:.4f} | val_f1={m_val['f1_macro']:.4f} | {time.time() - inicio:.0f}s", flush=True)

        if m_val["f1_macro"] > mejor_f1:
            mejor_f1, sin_mejora = m_val["f1_macro"], 0
            mejor_estado = {k: v.detach().cpu().clone() for k, v in modelo.state_dict().items()}
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
    print("\n" + resumen("BETO (test)", m_test, META_CU2))
    for fuente, valores in por_fuente.items():
        print(f"  {fuente:12} n={valores['n']:4} acc={valores['accuracy']:.4f} f1(clases presentes)={valores['f1_macro_clases_presentes']:.4f}")

    salida = args.salida
    salida.mkdir(parents=True, exist_ok=True)
    tokenizer.model_max_length = args.max_length  # ai-service trunca con este mismo valor
    modelo.save_pretrained(salida)
    tokenizer.save_pretrained(salida)
    np.save(salida / "probs_val.npy", probs_val)
    np.save(salida / "probs_test.npy", probs_test)
    hiper = {"lr_encoder": args.lr, "lr_cabeza": args.lr * 10, "batch": args.batch, "max_length": args.max_length,
             "epocas_max": args.epocas, "epocas_corridas": len(historia["epoca"]), "paciencia": args.paciencia,
             "label_smoothing": args.label_smoothing, "pesos_clase": "raiz frecuencia inversa", "weight_decay": 0.01}
    guardar_resultados(salida, m_test, {"por_fuente": por_fuente, "hiperparametros": hiper, "val_f1_macro": mejor_f1,
                                        "modo_rapido": args.modo_rapido})
    guardar_matriz_confusion(test["etiqueta"], y_pred, salida / "matriz_confusion.png")
    guardar_curvas(historia, salida / "curvas_entrenamiento.png", "BETO")
    sql = escribir_sql_registro(salida, CODIGO, m_test, hiper, f"{CODIGO}/")
    if args.modo_rapido:
        print("\n[MODO RÁPIDO] Estas métricas NO son válidas: solo confirman que el script corre.")
    print(f"[OK] Modelo, métricas y {sql.name} en {salida}")


if __name__ == "__main__":
    main()
