"""
Entrena el baseline de texto CU2: TF-IDF + Regresion Logistica (cu2-tfidf-logreg-v1)
"""

import sys
import json
from pathlib import Path

# Configurar encoding UTF-8 seguro
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, f1_score, precision_score, recall_score
import matplotlib.pyplot as plt
from sklearn.metrics import ConfusionMatrixDisplay

CARPETA_ML = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_ML))
from mapeo_categorias import CATEGORIAS as CLASES

CARPETA_DATOS = CARPETA_ML / "datos"
CARPETA_MODELO = CARPETA_ML / "modelos" / "cu2-tfidf-logreg-v1"
CARPETA_MODELO.mkdir(parents=True, exist_ok=True)

train = pd.read_csv(CARPETA_DATOS / "train.csv")
val   = pd.read_csv(CARPETA_DATOS / "val.csv")
test  = pd.read_csv(CARPETA_DATOS / "test.csv")

print("Entrenando TF-IDF + Regresion Logistica...")
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=20_000)),
    ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
])
pipeline.fit(train["texto_es"], train["categoria"])

y_test = test["categoria"]
y_pred = pipeline.predict(test["texto_es"])

metricas = {
    "accuracy": float((y_pred == y_test).mean()),
    "f1_macro": float(f1_score(y_test, y_pred, average="macro", zero_division=0)),
    "f1_weighted": float(f1_score(y_test, y_pred, average="weighted", zero_division=0)),
    "precision_macro": float(precision_score(y_test, y_pred, average="macro", zero_division=0)),
    "recall_macro": float(recall_score(y_test, y_pred, average="macro", zero_division=0)),
    "reporte_por_clase": classification_report(y_test, y_pred, labels=CLASES, output_dict=True, zero_division=0),
}

print(f"Accuracy : {metricas['accuracy']*100:.2f}%")
print(f"F1-Macro : {metricas['f1_macro']*100:.2f}%")

with open(CARPETA_MODELO / "metricas.json", "w", encoding="utf-8") as f:
    json.dump(metricas, f, indent=2, ensure_ascii=False)

joblib.dump(pipeline, CARPETA_MODELO / "pipeline.joblib")

# Matriz de confusion
fig, ax = plt.subplots(figsize=(12, 12))
ConfusionMatrixDisplay.from_predictions(y_test, y_pred, xticks_rotation="vertical", ax=ax, colorbar=False)
plt.tight_layout()
plt.savefig(CARPETA_MODELO / "matriz_confusion.png", dpi=120)

# SQL
metricas_sql = {k: v for k, v in metricas.items() if k != "reporte_por_clase"}
sql = f"""UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps(metricas_sql)}'::jsonb,
       hiperparametros = COALESCE(hiperparametros, '{{}}'::jsonb) || '{{"ngram_range": [1, 2], "max_features": 20000}}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = 'cu2-tfidf-logreg-v1/pipeline.joblib'
 WHERE codigo = 'cu2-tfidf-logreg-v1';
"""
(CARPETA_MODELO / "registro_modelo.sql").write_text(sql, encoding="utf-8")
print("Modelo guardado y SQL generado.")
