"""
Script de entrenamiento CU2 - BETO (dccuchile/bert-base-spanish-wwm-cased)
y evaluacion de Fusion Multimodal (ResNet-50 + BETO) para OE1.

Uso:
    .\\.venv\\Scripts\\python.exe entrenar_cu2_beto.py
"""

import sys
import io
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
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    get_linear_schedule_with_warmup,
)
from PIL import Image
from torchvision import transforms, models
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, classification_report
import pandas as pd
import matplotlib.pyplot as plt

def main():
    SEMILLA = 42
    CARPETA_ML = Path(__file__).resolve().parent
    CARPETA_DATOS = CARPETA_ML / "datos"
    CARPETA_MODELO_BETO = CARPETA_ML / "modelos" / "cu2-beto-v1"
    CARPETA_MODELO_BETO.mkdir(parents=True, exist_ok=True)
    CARPETA_MODELO_IMAGEN = CARPETA_ML / "modelos" / "cu1-imagen"

    random.seed(SEMILLA)
    np.random.seed(SEMILLA)
    torch.manual_seed(SEMILLA)

    DISPOSITIVO = "cuda" if torch.cuda.is_available() else "cpu"
    print("=" * 60)
    print("ENTRENAMIENTO MODELO 4: CU2 - BETO (Fine-Tuning)")
    print(f"Dispositivo : {DISPOSITIVO}")
    if DISPOSITIVO == "cuda":
        print(f"GPU         : {torch.cuda.get_device_name(0)}")
        print(f"VRAM        : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print("=" * 60)

    # 1. Cargar datos
    train = pd.read_csv(CARPETA_DATOS / "train.csv")
    val   = pd.read_csv(CARPETA_DATOS / "val.csv")
    test  = pd.read_csv(CARPETA_DATOS / "test.csv")

    CLASES = sorted(train["categoria"].unique())
    LABEL2ID = {c: i for i, c in enumerate(CLASES)}
    ID2LABEL = {i: c for c, i in LABEL2ID.items()}

    print(f"\n[DATOS] train={len(train)} | val={len(val)} | test={len(test)}")
    print(f"[CLASES] {len(CLASES)} categorias.")

    # 2. Tokenizar
    MODELO_BASE = "dccuchile/bert-base-spanish-wwm-cased"
    print(f"\n[INFO] Descargando/cargando tokenizer y pesos de '{MODELO_BASE}'...")
    tokenizer = AutoTokenizer.from_pretrained(MODELO_BASE)

    class DatasetTexto(Dataset):
        def __init__(self, textos, etiquetas, tok):
            self.encodings = tok(
                list(textos),
                truncation=True,
                max_length=128,
                padding=True,
                return_tensors="pt"
            )
            self.etiquetas = list(etiquetas)

        def __len__(self):
            return len(self.etiquetas)

        def __getitem__(self, idx):
            item = {k: v[idx] for k, v in self.encodings.items()}
            item["labels"] = torch.tensor(self.etiquetas[idx], dtype=torch.long)
            return item

    y_train = train["categoria"].map(LABEL2ID).tolist()
    y_val   = val["categoria"].map(LABEL2ID).tolist()
    y_test  = test["categoria"].map(LABEL2ID).tolist()

    BATCH_SIZE = 16
    train_loader = DataLoader(DatasetTexto(train["texto_es"], y_train, tokenizer), batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(DatasetTexto(val["texto_es"],   y_val,   tokenizer), batch_size=BATCH_SIZE)
    test_loader  = DataLoader(DatasetTexto(test["texto_es"],  y_test,  tokenizer), batch_size=BATCH_SIZE)

    # 3. Modelo BETO
    modelo = AutoModelForSequenceClassification.from_pretrained(
        MODELO_BASE,
        num_labels=len(CLASES),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    ).to(DISPOSITIVO)

    # 4. Optimizador y Scheduler
    EPOCAS = 4
    LR = 2e-5
    optimizador = torch.optim.AdamW(modelo.parameters(), lr=LR)
    total_pasos = len(train_loader) * EPOCAS
    scheduler = get_linear_schedule_with_warmup(optimizador, num_warmup_steps=int(total_pasos * 0.1), num_training_steps=total_pasos)

    def evaluar_beto(loader):
        modelo.eval()
        y_true, y_pred, perdida_total = [], [], 0.0
        with torch.no_grad():
            for lote in loader:
                etiquetas = lote.pop("labels").to(DISPOSITIVO)
                lote = {k: v.to(DISPOSITIVO) for k, v in lote.items()}
                salida = modelo(**lote, labels=etiquetas)
                perdida_total += salida.loss.item() * len(etiquetas)
                y_pred.extend(salida.logits.argmax(dim=1).cpu().tolist())
                y_true.extend(etiquetas.cpu().tolist())
        return {
            "loss": perdida_total / max(len(y_true), 1),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        }

    print("\n" + "=" * 60)
    print(">>> Iniciando Fine-Tuning de BETO con Early Stopping...")
    print("=" * 60)

    historia = {"epoca": [], "train_loss": [], "val_loss": [], "val_accuracy": [], "val_f1_macro": []}
    mejor_f1, mejor_estado, epocas_sin_mejora = -1.0, None, 0
    PACIENCIA = 2

    for epoca in range(1, EPOCAS + 1):
        modelo.train()
        perdida_total = 0.0
        for lote in train_loader:
            etiquetas = lote.pop("labels").to(DISPOSITIVO)
            lote = {k: v.to(DISPOSITIVO) for k, v in lote.items()}
            optimizador.zero_grad()
            salida = modelo(**lote, labels=etiquetas)
            salida.loss.backward()
            optimizador.step()
            scheduler.step()
            perdida_total += salida.loss.item() * len(etiquetas)

        m = evaluar_beto(val_loader)
        historia["epoca"].append(epoca)
        historia["train_loss"].append(perdida_total / len(train))
        historia["val_loss"].append(m["loss"])
        historia["val_accuracy"].append(m["accuracy"])
        historia["val_f1_macro"].append(m["f1_macro"])

        print(f"  [BETO] Epoca {epoca}/{EPOCAS} | train_loss={historia['train_loss'][-1]:.4f} | val_acc={m['accuracy']:.4f} | val_f1={m['f1_macro']:.4f}")

        if m["f1_macro"] > mejor_f1 or mejor_estado is None:
            mejor_f1 = m["f1_macro"]
            mejor_estado = {k: v.cpu().clone() for k, v in modelo.state_dict().items()}
            epocas_sin_mejora = 0
            print(f"    -> [CHECKPOINT] Mejor F1-macro de validacion: {mejor_f1:.4f}")
        else:
            epocas_sin_mejora += 1
            if epocas_sin_mejora >= PACIENCIA:
                print(f"    [EARLY STOPPING] Parada temprana en epoca {epoca}")
                break

    modelo.load_state_dict(mejor_estado)
    print(f"\n[OK] Modelo restaurado al mejor checkpoint (Val F1={mejor_f1:.4f})")

    # 5. Evaluacion sobre conjunto de prueba (TEST)
    print("\n" + "=" * 60)
    print(">>> Evaluando BETO sobre conjunto de PRUEBA (TEST)...")
    print("=" * 60)
    modelo.eval()
    y_true, y_pred = [], []
    with torch.no_grad():
        for lote in test_loader:
            etiquetas = lote.pop("labels")
            lote = {k: v.to(DISPOSITIVO) for k, v in lote.items()}
            logits = modelo(**lote).logits
            y_pred.extend(logits.argmax(dim=1).cpu().tolist())
            y_true.extend(etiquetas.tolist())

    metricas_beto = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
    }
    print("Metricas BETO en Test:")
    for k, v in metricas_beto.items():
        print(f"  {k:15}: {v:.4f}")

    # 6. Guardar modelo BETO
    print("\n[GUARDAR] Guardando modelo BETO y tokenizer...")
    modelo.save_pretrained(CARPETA_MODELO_BETO)
    tokenizer.save_pretrained(CARPETA_MODELO_BETO)
    with open(CARPETA_MODELO_BETO / "metricas.json", "w", encoding="utf-8") as f:
        json.dump(metricas_beto, f, indent=2, ensure_ascii=False)
    print(f"  [OK] Guardado en {CARPETA_MODELO_BETO}")

    # Guardar curvas
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    ax1.plot(historia["epoca"], historia["train_loss"], label="train")
    ax1.plot(historia["epoca"], historia["val_loss"], label="val")
    ax1.set_title("Perdida"); ax1.set_xlabel("Epoca"); ax1.legend()
    ax2.plot(historia["epoca"], historia["val_accuracy"], label="val accuracy")
    ax2.plot(historia["epoca"], historia["val_f1_macro"], label="val F1-macro")
    ax2.set_title("Validacion"); ax2.set_xlabel("Epoca"); ax2.legend()
    plt.tight_layout()
    plt.savefig(CARPETA_MODELO_BETO / "curvas_entrenamiento.png", dpi=120)

    # 7. Generar SQL para BETO
    sql_beto = f"""UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps(metricas_beto)}'::jsonb,
       hiperparametros = COALESCE(hiperparametros, '{{}}'::jsonb) || '{{"lr": {LR}, "epocas_corridas": {len(historia["epoca"])}, "max_length": 128}}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = 'cu2-beto-v1/'
 WHERE codigo = 'cu2-beto-v1';
"""
    (CARPETA_MODELO_BETO / "registro_modelo.sql").write_text(sql_beto, encoding="utf-8")
    print(f"  [OK] SQL de registro generado en {CARPETA_MODELO_BETO / 'registro_modelo.sql'}")

    # 8. FUSION MULTIMODAL (ResNet-50 + BETO)
    print("\n" + "=" * 60)
    print(">>> 9. EVALUANDO FUSION MULTIMODAL (ResNet-50 [Imagen] + BETO [Texto])...")
    print("=" * 60)

    ruta_resnet = CARPETA_MODELO_IMAGEN / "resnet50.pt"
    if not ruta_resnet.exists():
        print(f"[AVISO] No se encontro {ruta_resnet}. Saltando evaluacion de fusion.")
        return

    # Cargar ResNet-50
    checkpoint = torch.load(ruta_resnet, map_location=DISPOSITIVO, weights_only=False)
    modelo_resnet = models.resnet50()
    modelo_resnet.fc = nn.Linear(modelo_resnet.fc.in_features, len(CLASES))
    modelo_resnet.load_state_dict(checkpoint["modelo"])
    modelo_resnet = modelo_resnet.to(DISPOSITIVO).eval()

    TRANSFORM_EVAL = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    def get_probs_imagen(df_subset):
        todas = []
        with torch.no_grad():
            for ruta in df_subset["ruta_imagen"]:
                img = Image.open(ruta).convert("RGB")
                entrada = TRANSFORM_EVAL(img).unsqueeze(0).to(DISPOSITIVO)
                logits = modelo_resnet(entrada)
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu()
                todas.append(probs)
        return torch.stack(todas)

    def get_probs_texto(df_subset):
        todas = []
        with torch.no_grad():
            for texto in df_subset["texto_es"]:
                entrada = tokenizer(texto, return_tensors="pt", truncation=True, max_length=128).to(DISPOSITIVO)
                logits = modelo(**entrada).logits
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu()
                todas.append(probs)
        return torch.stack(todas)

    print("Calculando probabilidades en conjunto de VALIDACION...")
    probs_img_val = get_probs_imagen(val)
    probs_txt_val = get_probs_texto(val)
    y_val_idx = val["categoria"].map(LABEL2ID).tolist()

    # Buscar el mejor peso de combinacion en VALIDACION (no en test)
    mejor_peso, mejor_f1_val = 0.5, -1.0
    for peso in [i / 10.0 for i in range(0, 11)]:
        comb = peso * probs_img_val + (1.0 - peso) * probs_txt_val
        pred = comb.argmax(dim=1).tolist()
        f1 = f1_score(y_val_idx, pred, average="macro", zero_division=0)
        if f1 > mejor_f1_val:
            mejor_f1_val = f1
            mejor_peso = peso
    print(f"Mejor peso de Imagen elegido en Validacion: {mejor_peso:.1f} (Peso de Texto: {1.0 - mejor_peso:.1f})")

    # Evaluar en conjunto de PRUEBA (TEST) con el mejor peso
    print("\nEvaluando FUSION en conjunto de PRUEBA (TEST)...")
    probs_img_test = get_probs_imagen(test)
    probs_txt_test = get_probs_texto(test)
    y_test_idx = test["categoria"].map(LABEL2ID).tolist()

    comb_test = mejor_peso * probs_img_test + (1.0 - mejor_peso) * probs_txt_test
    pred_test = comb_test.argmax(dim=1).tolist()

    fusion_acc = float(accuracy_score(y_test_idx, pred_test))
    fusion_f1  = float(f1_score(y_test_idx, pred_test, average="macro", zero_division=0))

    metricas_fusion = {
        "peso_imagen": mejor_peso,
        "peso_texto": 1.0 - mejor_peso,
        "accuracy": fusion_acc,
        "f1_macro": fusion_f1,
    }
    with open(CARPETA_MODELO_IMAGEN / "metricas_fusion.json", "w", encoding="utf-8") as f:
        json.dump(metricas_fusion, f, indent=2)

    # Comparativa Final
    cumple_oe1 = (fusion_acc >= 0.80 and fusion_f1 >= 0.75)
    cumple_oe2 = (metricas_beto["f1_macro"] >= 0.85)

    print("\n" + "=" * 60)
    print("COMPARATIVA GLOBAL Y EVALUACION DE METAS")
    print("=" * 60)
    print(f"1. ResNet-50 solo (Imagen)       : Accuracy = 66.21% | F1-macro = 64.19%")
    print(f"2. BETO solo (Texto)             : Accuracy = {metricas_beto['accuracy']*100:.2f}% | F1-macro = {metricas_beto['f1_macro']*100:.2f}%")
    print(f"3. FUSION MULTIMODAL (Img + Txt) : Accuracy = {fusion_acc*100:.2f}% | F1-macro = {fusion_f1*100:.2f}%")
    print("-" * 60)
    print(f"Meta OE1 (Accuracy >= 80% y F1 >= 0.75): {'[CUMPLIDA]' if cumple_oe1 else '[NO ALCANZADA]'}")
    print(f"Meta OE2 (F1-macro BETO >= 0.85)       : {'[CUMPLIDA]' if cumple_oe2 else '[NO ALCANZADA]'}")
    print("=" * 60)

if __name__ == "__main__":
    main()
