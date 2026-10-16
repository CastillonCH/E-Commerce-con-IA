"""CU2 — Entrena el clasificador de texto (título + descripción).

Meta del T1 (OE2): F1-macro >= 0.85 y superar al baseline TF-IDF +
regresión logística (Tabla 10 del documento). Este script entrena AMBOS
—el baseline y BETO— e imprime la comparación.

Requiere acceso a internet la primera vez (descarga BETO desde Hugging
Face: dccuchile/bert-base-spanish-wwm-cased) — mismo caso que CU1 si este
sandbox te niega huggingface.co.

Formato de datos esperado: un CSV con columnas `nombre`, `descripcion`
(puede ir vacía) y `categoria` (debe ser uno de los 21 nombres exactos de
app/config.py). Ver ai-service/data/README.md.

Uso:
    python scripts/train_cu2_text.py --csv data/productos_texto.csv --epochs 4
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
import torch
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import CATEGORIAS  # noqa: E402

MODELO_BASE = "dccuchile/bert-base-spanish-wwm-cased"


class DatasetTexto(Dataset):
    def __init__(self, textos: list[str], etiquetas: list[int], tokenizer):
        self.encodings = tokenizer(textos, truncation=True, max_length=128, padding=True)
        self.etiquetas = etiquetas

    def __len__(self) -> int:
        return len(self.etiquetas)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.etiquetas[idx])
        return item


def cargar_datos(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path).fillna({"descripcion": ""})
    faltantes = {"nombre", "descripcion", "categoria"} - set(df.columns)
    if faltantes:
        sys.exit(f"Al CSV le faltan columnas: {faltantes}")

    categorias_invalidas = set(df["categoria"]) - set(CATEGORIAS)
    if categorias_invalidas:
        sys.exit(
            f"Categorías en el CSV que no están en app/config.py: {sorted(categorias_invalidas)}"
        )
    df["texto"] = (df["nombre"] + ". " + df["descripcion"]).str.strip()
    return df


def entrenar_baseline(textos_train, y_train, textos_val, y_val) -> dict:
    vectorizador = TfidfVectorizer(ngram_range=(1, 2), max_features=20_000)
    X_train = vectorizador.fit_transform(textos_train)
    X_val = vectorizador.transform(textos_val)

    modelo = LogisticRegression(max_iter=1000, class_weight="balanced")
    modelo.fit(X_train, y_train)
    y_pred = modelo.predict(X_val)

    return {
        "accuracy": round(accuracy_score(y_val, y_pred), 4),
        "f1_macro": round(f1_score(y_val, y_pred, average="macro"), 4),
    }


def entrenar_beto(
    textos_train, y_train, textos_val, y_val, clases: list[str], epochs: int, batch_size: int, lr: float
) -> tuple[dict, "torch.nn.Module", "AutoTokenizer"]:
    id2label = dict(enumerate(clases))
    label2id = {v: k for k, v in id2label.items()}

    tokenizer = AutoTokenizer.from_pretrained(MODELO_BASE)
    modelo = AutoModelForSequenceClassification.from_pretrained(
        MODELO_BASE, num_labels=len(clases), id2label=id2label, label2id=label2id
    )

    train_ds = DatasetTexto(textos_train, y_train, tokenizer)
    val_ds = DatasetTexto(textos_val, y_val, tokenizer)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
    modelo.to(dispositivo)
    optimizador = torch.optim.AdamW(modelo.parameters(), lr=lr)
    total_pasos = len(train_loader) * epochs
    scheduler = get_linear_schedule_with_warmup(optimizador, 0, total_pasos)

    mejor_f1 = -1.0
    mejor_metricas: dict[str, float] = {}
    mejor_estado = None

    for epoca in range(1, epochs + 1):
        modelo.train()
        for lote in train_loader:
            lote = {k: v.to(dispositivo) for k, v in lote.items()}
            optimizador.zero_grad()
            salida = modelo(**lote)
            salida.loss.backward()
            optimizador.step()
            scheduler.step()

        modelo.eval()
        y_true, y_pred = [], []
        with torch.no_grad():
            for lote in val_loader:
                etiquetas = lote.pop("labels")
                lote = {k: v.to(dispositivo) for k, v in lote.items()}
                logits = modelo(**lote).logits
                y_pred.extend(logits.argmax(dim=1).cpu().tolist())
                y_true.extend(etiquetas.tolist())

        metricas = {
            "accuracy": round(accuracy_score(y_true, y_pred), 4),
            "f1_macro": round(f1_score(y_true, y_pred, average="macro"), 4),
        }
        print(f"[BETO] época {epoca}/{epochs}  val_accuracy={metricas['accuracy']}  val_f1_macro={metricas['f1_macro']}")

        if metricas["f1_macro"] > mejor_f1:
            mejor_f1 = metricas["f1_macro"]
            mejor_metricas = metricas
            mejor_estado = {k: v.cpu().clone() for k, v in modelo.state_dict().items()}

    modelo.load_state_dict(mejor_estado)
    return mejor_metricas, modelo, tokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--output", type=Path, default=Path("models/cu2_beto"))
    args = parser.parse_args()

    df = cargar_datos(args.csv)
    clases = sorted(df["categoria"].unique())
    label2id = {c: i for i, c in enumerate(clases)}
    y = df["categoria"].map(label2id).tolist()

    textos_train, textos_val, y_train, y_val = train_test_split(
        df["texto"].tolist(), y, test_size=args.val_split, random_state=42, stratify=y
    )

    print(f"Entrenando baseline (TF-IDF + regresión logística) — {len(textos_train)} train / {len(textos_val)} val")
    metricas_baseline = entrenar_baseline(textos_train, y_train, textos_val, y_val)
    print("Baseline:", metricas_baseline)

    print("\nEntrenando BETO (fine-tuning)...")
    metricas_beto, modelo, tokenizer = entrenar_beto(
        textos_train, y_train, textos_val, y_val, clases, args.epochs, args.batch_size, args.lr
    )

    args.output.mkdir(parents=True, exist_ok=True)
    modelo.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    cumple_meta = metricas_beto["f1_macro"] >= 0.85 and metricas_beto["f1_macro"] > metricas_baseline["f1_macro"]
    print(f"\nBETO (mejor época): {metricas_beto}")
    print(f"Baseline:           {metricas_baseline}")
    print(
        "Meta OE2 (F1-macro BETO >= 0.85 y > baseline):",
        "CUMPLIDA ✓" if cumple_meta else "NO alcanzada todavía",
    )
    print(f"Checkpoint guardado en {args.output}")

    (args.output / "metricas_comparacion.json").write_text(
        json.dumps({"baseline_tfidf_logreg": metricas_baseline, "beto": metricas_beto}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
