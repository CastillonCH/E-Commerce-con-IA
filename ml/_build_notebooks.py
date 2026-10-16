"""Construye los 4 notebooks de ml/notebooks/*.ipynb con nbformat, en vez
de escribir el JSON a mano. Correr `python _build_notebooks.py` después
de editar este archivo para regenerarlos.
"""

from pathlib import Path

import nbformat as nbf

CARPETA_SALIDA = Path(__file__).resolve().parent / "notebooks"


def nb_nuevo():
    nb = nbf.v4.new_notebook()
    nb["metadata"] = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    }
    nb["cells"] = []
    return nb


def md(nb, texto):
    nb["cells"].append(nbf.v4.new_markdown_cell(texto))


def code(nb, texto):
    nb["cells"].append(nbf.v4.new_code_cell(texto))


CELDA_INSTALAR = '''\
# Si ya corriste esta celda en esta sesión de Colab, puedes saltarla.
import sys

EN_COLAB = "google.colab" in sys.modules

if EN_COLAB:
    from google.colab import drive
    drive.mount("/content/drive")
    CARPETA_ML = "/content/drive/MyDrive/NovaStore_IA/ml"
    get_ipython().system(f"pip install -q -r {{CARPETA_ML}}/requirements.txt")
else:
    # Ejecución local (verificación, no Colab): usa la carpeta ml/ del repo.
    CARPETA_ML = str(__import__("pathlib").Path.cwd())

sys.path.insert(0, CARPETA_ML)
print("CARPETA_ML =", CARPETA_ML)
'''

CELDA_CONFIG = '''\
import random
from pathlib import Path

import numpy as np
import torch

# --- Configuración: edita esto antes de correr en Colab ---
CARPETA_DRIVE = Path(CARPETA_ML) / "datos"  # train.csv/val.csv/test.csv (los crea 00_preparar_dataset.ipynb)
CARPETA_MODELOS = Path(CARPETA_ML) / "modelos" / "{codigo_modelo}"
MODO_RAPIDO = False  # True = 5 ejemplos/clase, 1 época — solo para probar que el notebook corre de punta a punta
SEMILLA = 42
# ------------------------------------------------------------

random.seed(SEMILLA)
np.random.seed(SEMILLA)
torch.manual_seed(SEMILLA)

DISPOSITIVO = "cuda" if torch.cuda.is_available() else "cpu"
print(f"MODO_RAPIDO={{MODO_RAPIDO}} · dispositivo={{DISPOSITIVO}} · GPU disponible: {{torch.cuda.is_available()}}")
if DISPOSITIVO == "cpu":
    print("Sin GPU: en Colab, activa Entorno de ejecución -> Cambiar tipo de entorno -> T4 GPU.")

CARPETA_MODELOS.mkdir(parents=True, exist_ok=True)
'''


def celda_cargar_particion(con_fallback_sintetico: bool) -> str:
    base = '''\
import pandas as pd

{fallback}

train = pd.read_csv(CARPETA_DRIVE / "train.csv")
val = pd.read_csv(CARPETA_DRIVE / "val.csv")
test = pd.read_csv(CARPETA_DRIVE / "test.csv")

if MODO_RAPIDO:
    train = train.groupby("categoria", group_keys=False).head(5)
    val = val.groupby("categoria", group_keys=False).head(2)
    test = test.groupby("categoria", group_keys=False).head(2)

print(f"train={{len(train)}} val={{len(val)}} test={{len(test)}}")
train.head()
'''
    fallback = (
        'if MODO_RAPIDO:\n'
        '    from _modo_rapido_fallback import generar_si_falta\n'
        '    generar_si_falta(CARPETA_DRIVE)\n'
    ) if con_fallback_sintetico else ""
    return base.format(fallback=fallback)


def construir_00():
    nb = nb_nuevo()
    md(nb, """\
# 00 — Preparar el dataset

Este notebook descarga productos de `Shopify/product-catalogue`
(Hugging Face), los mapea a las 21 categorías de NovaStore, los traduce
a español cuando hace falta, y guarda `train.csv`/`val.csv`/`test.csv` en
tu Google Drive — **todos los demás notebooks leen esa misma partición**,
así que corre este primero.

Tiempo esperado en Colab (GPU T4 gratuita, pero acá casi no se usa GPU —
es sobre todo descarga y procesamiento de imágenes): entre 20 y 45
minutos para el dataset completo (300 ejemplos/clase), según qué tan
rápido esté Hugging Face ese día.""")

    code(nb, CELDA_INSTALAR)

    code(nb, '''\
from pathlib import Path

MODO_RAPIDO = False  # True = dataset diminuto (3000 filas revisadas, 5 ejemplos/clase) para probar que todo corre
CARPETA_DATOS = Path(CARPETA_ML) / "datos"
MAX_POR_CLASE = 5 if MODO_RAPIDO else 300
LIMITE_FILAS = 3000 if MODO_RAPIDO else None

print(f"MODO_RAPIDO={MODO_RAPIDO} · max_por_clase={MAX_POR_CLASE} · limite_filas={LIMITE_FILAS}")
''')

    md(nb, """\
## 1. Descargar, filtrar y mapear

`construir_dataset` recorre el dataset en streaming (no descarga los 9.5
GB de una sola vez), descarta lo que no tiene imagen o título, mapea la
categoría con `mapeo_categorias.py`, y corta cada clase en
`MAX_POR_CLASE` ejemplos. Al final imprime cuántos ejemplos quedaron por
categoría — si alguna aparece "DÉBIL", revisa `ml/DATASET.md`.""")

    code(nb, '''\
from preparar_dataset import construir_dataset

df = construir_dataset(
    max_por_clase=MAX_POR_CLASE,
    limite_filas=LIMITE_FILAS,
    carpeta_salida=CARPETA_DATOS,
)
df.head()
''')

    md(nb, """\
## 2. Traducir a español

Los textos que `langdetect` no identifica como español se traducen con
`Helsinki-NLP/opus-mt-en-es`. Ver la limitación metodológica (textos en
un tercer idioma) en `ml/DATASET.md`.""")

    code(nb, '''\
from preparar_dataset import traducir_a_espanol

df = traducir_a_espanol(df)
df[["titulo", "texto_es"]].sample(min(5, len(df)))
''')

    md(nb, "## 3. Partir en train/val/test (70/15/15, semilla 42) y guardar")

    code(nb, '''\
from preparar_dataset import guardar_particion, particionar

train, val, test = particionar(df, estratificar=not MODO_RAPIDO)
guardar_particion(train, val, test, CARPETA_DATOS)
''')

    md(nb, "## 4. Revisar: conteo por clase y algunos ejemplos con imagen")

    code(nb, '''\
import matplotlib.pyplot as plt
from PIL import Image

print(train["categoria"].value_counts())

muestra = train.sample(min(8, len(train)), random_state=42)
fig, ejes = plt.subplots(2, 4, figsize=(14, 7))
for ax, (_, fila) in zip(ejes.flat, muestra.iterrows()):
    try:
        ax.imshow(Image.open(fila["ruta_imagen"]))
    except Exception:
        pass
    ax.set_title(fila["categoria"], fontsize=9)
    ax.axis("off")
plt.tight_layout()
plt.show()
''')

    return nb


def construir_01():
    nb = nb_nuevo()
    md(nb, """\
# 01 — CU2 baseline: TF-IDF + Regresión logística

Antes de ajustar BETO (notebook 02), este notebook entrena un modelo
simple de referencia: TF-IDF (unigramas y bigramas) + regresión
logística. Sirve para comprobar que BETO de verdad aporta algo —la meta
del T1 (OE2) es que BETO supere a este baseline, no solo que llegue a
F1-macro ≥ 0,85.

Tiempo esperado: menos de 5 minutos incluso con el dataset completo (no
usa GPU).""")

    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_CONFIG.format(codigo_modelo="cu2-tfidf-logreg-v1"))
    md(nb, "## 1. Cargar la partición (la que armó 00_preparar_dataset.ipynb)")
    code(nb, celda_cargar_particion(con_fallback_sintetico=True))

    md(nb, "## 2. Entrenar TF-IDF + regresión logística")
    code(nb, '''\
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from mapeo_categorias import CATEGORIAS as CLASES  # las 21, en orden fijo — no solo las que aparezcan en train

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=20_000)),
    ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
])
pipeline.fit(train["texto_es"], train["categoria"])
print("Entrenado.")
''')

    md(nb, """\
## 3. Evaluar sobre el conjunto de PRUEBA

(No sobre validación — las métricas que importan para el informe y para
`modelos_ia` son las del conjunto de prueba, que el modelo nunca vio.)""")

    code(nb, '''\
import json

from sklearn.metrics import classification_report, confusion_matrix, f1_score, precision_score, recall_score

y_test = test["categoria"]
y_pred = pipeline.predict(test["texto_es"])

metricas = {
    "accuracy": float((y_pred == y_test).mean()),
    "f1_macro": float(f1_score(y_test, y_pred, average="macro")),
    "f1_weighted": float(f1_score(y_test, y_pred, average="weighted")),
    "precision_macro": float(precision_score(y_test, y_pred, average="macro", zero_division=0)),
    "recall_macro": float(recall_score(y_test, y_pred, average="macro", zero_division=0)),
    # labels=CLASES a propósito: igual que en 02_cu2_beto, si el conjunto
    # de prueba no tiene ejemplos de alguna categoría el reporte debe
    # listarla igual con ceros, no reventar ni desaparecerla en silencio.
    "reporte_por_clase": classification_report(y_test, y_pred, labels=CLASES, output_dict=True, zero_division=0),
}
print(json.dumps({k: v for k, v in metricas.items() if k != "reporte_por_clase"}, indent=2, ensure_ascii=False))

with open(CARPETA_MODELOS / "metricas.json", "w", encoding="utf-8") as f:
    json.dump(metricas, f, indent=2, ensure_ascii=False)
''')

    md(nb, """\
## 4. Matriz de confusión

(No hay curvas de pérdida/accuracy por época para este baseline: la
regresión logística de scikit-learn no entrena por épocas como una red
neuronal, así que esa gráfica no aplica acá — sí aplica, y se genera, en
02_cu2_beto y 03_cu1_imagen.)""")

    code(nb, '''\
import matplotlib.pyplot as plt
from sklearn.metrics import ConfusionMatrixDisplay

fig, ax = plt.subplots(figsize=(12, 12))
ConfusionMatrixDisplay.from_predictions(
    y_test, y_pred, xticks_rotation="vertical", ax=ax, colorbar=False
)
plt.tight_layout()
plt.savefig(CARPETA_MODELOS / "matriz_confusion.png", dpi=120)
plt.show()
''')

    md(nb, "## 5. Guardar el pipeline y el SQL para registrar el modelo")
    code(nb, '''\
joblib.dump(pipeline, CARPETA_MODELOS / "pipeline.joblib")

sql = f"""
UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps({k: v for k, v in metricas.items() if k != "reporte_por_clase"})}'::jsonb,
       hiperparametros = hiperparametros || '{{"ngram_range": [1, 2], "max_features": 20000}}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = 'cu2-tfidf-logreg-v1/pipeline.joblib'
 WHERE codigo = 'cu2-tfidf-logreg-v1';
"""
(CARPETA_MODELOS / "registro_modelo.sql").write_text(sql, encoding="utf-8")
print(sql)
print(f"\\nGuardado en {CARPETA_MODELOS}")
''')

    return nb


def construir_02():
    nb = nb_nuevo()
    md(nb, """\
# 02 — CU2: fine-tuning de BETO

Ajusta `dccuchile/bert-base-spanish-wwm-cased` (BETO) a las 21
categorías, con early stopping sobre el F1-macro de validación. Meta
(OE2): F1-macro ≥ 0,85 en el conjunto de prueba, y superar al baseline
de 01_cu2_baseline_tfidf.

Tiempo esperado en GPU T4: 15-30 minutos para el dataset completo (3-4
épocas). En CPU (MODO_RAPIDO) es cuestión de minutos porque solo corre 1
época sobre un puñado de ejemplos.""")

    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_CONFIG.format(codigo_modelo="cu2-beto-v1"))
    md(nb, "## 1. Cargar la partición")
    code(nb, celda_cargar_particion(con_fallback_sintetico=True))

    md(nb, "## 2. Tokenizar y armar los DataLoaders")
    code(nb, '''\
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

MODELO_BASE = "dccuchile/bert-base-spanish-wwm-cased"
CLASES = sorted(train["categoria"].unique())
LABEL2ID = {c: i for i, c in enumerate(CLASES)}
ID2LABEL = {i: c for c, i in LABEL2ID.items()}

class DatasetTexto(Dataset):
    def __init__(self, textos, etiquetas, tokenizer):
        self.encodings = tokenizer(list(textos), truncation=True, max_length=128, padding=True)
        self.etiquetas = list(etiquetas)

    def __len__(self):
        return len(self.etiquetas)

    def __getitem__(self, idx):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.etiquetas[idx])
        return item

tokenizer = AutoTokenizer.from_pretrained(MODELO_BASE)
y_train = train["categoria"].map(LABEL2ID)
y_val = val["categoria"].map(LABEL2ID)
y_test = test["categoria"].map(LABEL2ID)

BATCH_SIZE = 16
train_loader = DataLoader(DatasetTexto(train["texto_es"], y_train, tokenizer), batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(DatasetTexto(val["texto_es"], y_val, tokenizer), batch_size=BATCH_SIZE)
test_loader = DataLoader(DatasetTexto(test["texto_es"], y_test, tokenizer), batch_size=BATCH_SIZE)

modelo = AutoModelForSequenceClassification.from_pretrained(
    MODELO_BASE, num_labels=len(CLASES), id2label=ID2LABEL, label2id=LABEL2ID
).to(DISPOSITIVO)
print(f"{len(CLASES)} clases · {len(train)} train / {len(val)} val / {len(test)} test")
''')

    md(nb, "## 3. Entrenar con early stopping sobre F1-macro de validación")
    code(nb, '''\
from sklearn.metrics import accuracy_score, f1_score

EPOCAS = 1 if MODO_RAPIDO else 4
LR = 2e-5

optimizador = torch.optim.AdamW(modelo.parameters(), lr=LR)
total_pasos = len(train_loader) * EPOCAS
scheduler = get_linear_schedule_with_warmup(optimizador, 0, total_pasos)

def evaluar(loader):
    modelo.eval()
    y_true, y_pred, perdida_total = [], [], 0.0
    with torch.no_grad():
        for lote in loader:
            etiquetas = lote.pop("labels")
            lote = {k: v.to(DISPOSITIVO) for k, v in lote.items()}
            etiquetas = etiquetas.to(DISPOSITIVO)
            salida = modelo(**lote, labels=etiquetas)
            perdida_total += salida.loss.item() * len(etiquetas)
            y_pred.extend(salida.logits.argmax(dim=1).cpu().tolist())
            y_true.extend(etiquetas.cpu().tolist())
    return {
        "loss": perdida_total / max(len(y_true), 1),
        "accuracy": accuracy_score(y_true, y_pred),
        "f1_macro": f1_score(y_true, y_pred, average="macro", zero_division=0),
    }

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

    metricas_val = evaluar(val_loader)
    historia["epoca"].append(epoca)
    historia["train_loss"].append(perdida_total / len(train))
    historia["val_loss"].append(metricas_val["loss"])
    historia["val_accuracy"].append(metricas_val["accuracy"])
    historia["val_f1_macro"].append(metricas_val["f1_macro"])
    print(f"época {epoca}/{EPOCAS}  train_loss={historia['train_loss'][-1]:.4f}  val_f1_macro={metricas_val['f1_macro']:.4f}")

    if metricas_val["f1_macro"] > mejor_f1:
        mejor_f1 = metricas_val["f1_macro"]
        mejor_estado = {k: v.cpu().clone() for k, v in modelo.state_dict().items()}
        epocas_sin_mejora = 0
    else:
        epocas_sin_mejora += 1
        if epocas_sin_mejora >= PACIENCIA:
            print(f"Early stopping en la época {epoca} (sin mejora hace {PACIENCIA} épocas).")
            break

modelo.load_state_dict(mejor_estado)
print(f"Mejor F1-macro de validación: {mejor_f1:.4f}")
''')

    md(nb, "## 4. Curvas de entrenamiento")
    code(nb, '''\
import matplotlib.pyplot as plt

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(historia["epoca"], historia["train_loss"], label="train")
ax1.plot(historia["epoca"], historia["val_loss"], label="val")
ax1.set_title("Pérdida"); ax1.set_xlabel("época"); ax1.legend()
ax2.plot(historia["epoca"], historia["val_accuracy"], label="val accuracy")
ax2.plot(historia["epoca"], historia["val_f1_macro"], label="val F1-macro")
ax2.set_title("Validación"); ax2.set_xlabel("época"); ax2.legend()
plt.tight_layout()
plt.savefig(CARPETA_MODELOS / "curvas_entrenamiento.png", dpi=120)
plt.show()
''')

    md(nb, "## 5. Evaluar sobre PRUEBA y comparar contra el baseline")
    code(nb, '''\
import json

from sklearn.metrics import classification_report, precision_score, recall_score

modelo.eval()
y_true, y_pred = [], []
with torch.no_grad():
    for lote in test_loader:
        etiquetas = lote.pop("labels")
        lote = {k: v.to(DISPOSITIVO) for k, v in lote.items()}
        logits = modelo(**lote).logits
        y_pred.extend(logits.argmax(dim=1).cpu().tolist())
        y_true.extend(etiquetas.tolist())

metricas = {
    "accuracy": float(accuracy_score(y_true, y_pred)),
    "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
    "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
    "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
    # labels=range(len(CLASES)) a propósito: si el set de prueba no tiene
    # ejemplos de alguna clase (pasa fácil en MODO_RAPIDO, y puede pasar
    # en una corrida real con una clase muy chica), classification_report
    # infiere las clases de y_true/y_pred — con menos clases que CLASES,
    # target_names no cuadra y revienta. Fijar labels lo evita siempre.
    "reporte_por_clase": classification_report(
        y_true, y_pred, labels=list(range(len(CLASES))), target_names=CLASES, output_dict=True, zero_division=0
    ),
}
print(json.dumps({k: v for k, v in metricas.items() if k != "reporte_por_clase"}, indent=2))

ruta_baseline = CARPETA_ML_PATH = (CARPETA_MODELOS.parent / "cu2-tfidf-logreg-v1" / "metricas.json")
if ruta_baseline.exists():
    baseline = json.loads(ruta_baseline.read_text())
    tabla = {
        "modelo": ["TF-IDF + LogReg (baseline)", "BETO (fine-tuned)"],
        "f1_macro": [baseline["f1_macro"], metricas["f1_macro"]],
        "accuracy": [baseline["accuracy"], metricas["accuracy"]],
    }
    import pandas as pd
    print()
    print(pd.DataFrame(tabla).to_string(index=False))
    print("\\nMeta OE2 (F1-macro>=0.85 y > baseline):",
          "CUMPLIDA" if metricas["f1_macro"] >= 0.85 and metricas["f1_macro"] > baseline["f1_macro"] else "NO alcanzada todavía")
else:
    print("(No se encontró metricas.json del baseline — corre 01_cu2_baseline_tfidf.ipynb primero para comparar.)")

with open(CARPETA_MODELOS / "metricas.json", "w", encoding="utf-8") as f:
    json.dump(metricas, f, indent=2, ensure_ascii=False)
''')

    md(nb, "## 6. Matriz de confusión")
    code(nb, '''\
from sklearn.metrics import ConfusionMatrixDisplay

fig, ax = plt.subplots(figsize=(12, 12))
ConfusionMatrixDisplay.from_predictions(
    [CLASES[i] for i in y_true], [CLASES[i] for i in y_pred], xticks_rotation="vertical", ax=ax, colorbar=False
)
plt.tight_layout()
plt.savefig(CARPETA_MODELOS / "matriz_confusion.png", dpi=120)
plt.show()
''')

    md(nb, """\
## 7. Guardar modelo + función de embeddings

El embedding de CU5 (duplicados) sale de BETO con mean pooling sobre la
última capa oculta (768 dimensiones) — no del token [CLS] solo, que es
una variante más ruidosa para similitud semántica.""")
    code(nb, '''\
modelo.save_pretrained(CARPETA_MODELOS)
tokenizer.save_pretrained(CARPETA_MODELOS)

def obtener_embedding(texto: str) -> list[float]:
    entrada = tokenizer(texto, return_tensors="pt", truncation=True, max_length=128, padding=True).to(DISPOSITIVO)
    with torch.no_grad():
        salida = modelo.base_model(**entrada)
        mascara = entrada["attention_mask"].unsqueeze(-1).float()
        suma = (salida.last_hidden_state * mascara).sum(1)
        conteo = mascara.sum(1).clamp(min=1e-9)
        embedding = (suma / conteo).squeeze(0)
    return embedding.cpu().tolist()

vector_prueba = obtener_embedding(test["texto_es"].iloc[0])
print(f"Embedding de prueba: {len(vector_prueba)} dimensiones (debe ser 768).")
assert len(vector_prueba) == 768

sql = f"""
UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps({k: v for k, v in metricas.items() if k != "reporte_por_clase"})}'::jsonb,
       hiperparametros = hiperparametros || '{{"lr": {LR}, "epocas_corridas": {len(historia["epoca"])}, "max_length": 128}}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = 'cu2-beto-v1/'
 WHERE codigo = 'cu2-beto-v1';
"""
(CARPETA_MODELOS / "registro_modelo.sql").write_text(sql, encoding="utf-8")
print(sql)
''')

    return nb


def construir_03():
    nb = nb_nuevo()
    md(nb, """\
# 03 — CU1: clasificación por imagen (ResNet-50 + EfficientNet-B0) y fusión

Ajusta dos arquitecturas por transfer learning (primero solo la cabeza,
después descongelando las últimas capas), las compara, y evalúa una
fusión imagen+texto (reutilizando el BETO de 02_cu2_beto) con el peso
elegido en validación. Meta (OE1): accuracy ≥ 0,80 y F1-macro ≥ 0,75 en
el conjunto de prueba.

Tiempo esperado en GPU T4: 30-50 minutos para el dataset completo (dos
arquitecturas, dos fases cada una). Es, de los 4 notebooks, el más lento
— si Colab se desconecta, los checkpoints intermedios quedan en Drive
para retomar (ver la celda de guardado de cada fase).""")

    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_CONFIG.format(codigo_modelo="cu1-imagen"))

    md(nb, "## 1. Cargar la partición y armar los `Dataset` de imágenes")
    code(nb, celda_cargar_particion(con_fallback_sintetico=True))

    code(nb, '''\
from io import BytesIO

from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

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

BATCH_SIZE = 16
train_loader = DataLoader(DatasetImagenes(train, TRANSFORM_TRAIN), batch_size=BATCH_SIZE, shuffle=True, num_workers=2)
val_loader = DataLoader(DatasetImagenes(val, TRANSFORM_EVAL), batch_size=BATCH_SIZE, num_workers=2)
test_loader = DataLoader(DatasetImagenes(test, TRANSFORM_EVAL), batch_size=BATCH_SIZE, num_workers=2)
print(f"{len(CLASES)} clases · {len(train)} train / {len(val)} val / {len(test)} test")
''')

    md(nb, """\
## 2. Función de entrenamiento genérica (dos fases + early stopping)

Fase 1: solo la cabeza (rápido, "aprende" a usar las features de
ImageNet). Fase 2: se descongela el último bloque y se reentrena con
learning rate más bajo (ajuste fino de verdad). Esto se repite igual para
ResNet-50 y EfficientNet-B0.""")

    code(nb, '''\
from sklearn.metrics import accuracy_score, f1_score
from torch import nn
from torchvision import models


def evaluar_imagen(modelo, loader):
    modelo.eval()
    y_true, y_pred, perdida_total, n = [], [], 0.0, 0
    criterio = nn.CrossEntropyLoss()
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
        "accuracy": accuracy_score(y_true, y_pred),
        "f1_macro": f1_score(y_true, y_pred, average="macro", zero_division=0),
    }


def entrenar_imagen(modelo, nombre, epocas_cabeza, epocas_finetune, carpeta_checkpoint):
    criterio = nn.CrossEntropyLoss()
    historia = {"epoca": [], "fase": [], "train_loss": [], "val_loss": [], "val_accuracy": [], "val_f1_macro": []}
    mejor_f1, mejor_estado = -1.0, None
    epoca_global = 0

    for fase, epocas, lr in [("cabeza", epocas_cabeza, 1e-3), ("fine-tune", epocas_finetune, 1e-4)]:
        if fase == "fine-tune":
            for nombre_param, parametro in modelo.named_parameters():
                if "layer4" in nombre_param or "features.8" in nombre_param or "fc" in nombre_param or "classifier" in nombre_param:
                    parametro.requires_grad = True
        parametros_entrenables = [p for p in modelo.parameters() if p.requires_grad]
        optimizador = torch.optim.AdamW(parametros_entrenables, lr=lr)
        scheduler = torch.optim.lr_scheduler.StepLR(optimizador, step_size=max(epocas // 2, 1), gamma=0.5)
        epocas_sin_mejora = 0

        for _ in range(epocas):
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

            metricas_val = evaluar_imagen(modelo, val_loader)
            historia["epoca"].append(epoca_global)
            historia["fase"].append(fase)
            historia["train_loss"].append(perdida_total / max(n, 1))
            historia["val_loss"].append(metricas_val["loss"])
            historia["val_accuracy"].append(metricas_val["accuracy"])
            historia["val_f1_macro"].append(metricas_val["f1_macro"])
            print(f"[{nombre}] {fase} época {epoca_global}  train_loss={historia['train_loss'][-1]:.4f}  val_f1_macro={metricas_val['f1_macro']:.4f}")

            if metricas_val["f1_macro"] > mejor_f1:
                mejor_f1 = metricas_val["f1_macro"]
                mejor_estado = {k: v.cpu().clone() for k, v in modelo.state_dict().items()}
                epocas_sin_mejora = 0
                torch.save({"modelo": mejor_estado, "clases": CLASES}, carpeta_checkpoint / f"checkpoint_{nombre}.pt")
            else:
                epocas_sin_mejora += 1
                if epocas_sin_mejora >= 2:
                    print(f"Early stopping ({nombre}, fase {fase}).")
                    break

    modelo.load_state_dict(mejor_estado)
    return modelo, historia, mejor_f1
''')

    md(nb, "## 3. Entrenar ResNet-50")
    code(nb, '''\
EPOCAS_CABEZA = 1 if MODO_RAPIDO else 3
EPOCAS_FINETUNE = 1 if MODO_RAPIDO else 4

resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2)
for parametro in resnet.parameters():
    parametro.requires_grad = False
resnet.fc = nn.Linear(resnet.fc.in_features, len(CLASES))
resnet = resnet.to(DISPOSITIVO)

resnet, historia_resnet, f1_resnet = entrenar_imagen(resnet, "resnet50", EPOCAS_CABEZA, EPOCAS_FINETUNE, CARPETA_MODELOS)
''')

    md(nb, "## 4. Entrenar EfficientNet-B0")
    code(nb, '''\
efficientnet = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
for parametro in efficientnet.parameters():
    parametro.requires_grad = False
efficientnet.classifier[1] = nn.Linear(efficientnet.classifier[1].in_features, len(CLASES))
efficientnet = efficientnet.to(DISPOSITIVO)

efficientnet, historia_efficientnet, f1_efficientnet = entrenar_imagen(
    efficientnet, "efficientnet_b0", EPOCAS_CABEZA, EPOCAS_FINETUNE, CARPETA_MODELOS
)
''')

    md(nb, "## 5. Curvas y comparación de ambas arquitecturas")
    code(nb, '''\
import matplotlib.pyplot as plt
import pandas as pd

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
for historia, nombre in [(historia_resnet, "ResNet-50"), (historia_efficientnet, "EfficientNet-B0")]:
    ax1.plot(historia["epoca"], historia["train_loss"], label=f"{nombre} train")
    ax2.plot(historia["epoca"], historia["val_f1_macro"], label=nombre)
ax1.set_title("Pérdida de entrenamiento"); ax1.set_xlabel("época"); ax1.legend()
ax2.set_title("F1-macro de validación"); ax2.set_xlabel("época"); ax2.legend()
plt.tight_layout()
plt.savefig(CARPETA_MODELOS / "curvas_entrenamiento.png", dpi=120)
plt.show()

metricas_resnet_test = evaluar_imagen(resnet, test_loader)
metricas_efficientnet_test = evaluar_imagen(efficientnet, test_loader)
tabla = pd.DataFrame({
    "modelo": ["ResNet-50", "EfficientNet-B0"],
    "val_f1_macro": [f1_resnet, f1_efficientnet],
    "test_accuracy": [metricas_resnet_test["accuracy"], metricas_efficientnet_test["accuracy"]],
    "test_f1_macro": [metricas_resnet_test["f1_macro"], metricas_efficientnet_test["f1_macro"]],
})
print(tabla.to_string(index=False))
''')

    md(nb, "## 6. Guardar ambos modelos + extractor de embeddings")
    code(nb, '''\
import json

for nombre, modelo, metricas_test, dim in [
    ("resnet50", resnet, metricas_resnet_test, 2048),
    ("efficientnet_b0", efficientnet, metricas_efficientnet_test, 1280),
]:
    torch.save({"modelo": modelo.state_dict(), "clases": CLASES, "arquitectura": nombre}, CARPETA_MODELOS / f"{nombre}.pt")
    with open(CARPETA_MODELOS / f"metricas_{nombre}.json", "w", encoding="utf-8") as f:
        json.dump(metricas_test, f, indent=2)
    print(f"{nombre}: dimensión de embedding = {dim}")

def extraer_embedding(modelo, imagen_pil):
    """Penúltima capa (avgpool/features), antes del clasificador final."""
    entrada = TRANSFORM_EVAL(imagen_pil).unsqueeze(0).to(DISPOSITIVO)
    extractor = nn.Sequential(*list(modelo.children())[:-1])
    modelo.eval()
    with torch.no_grad():
        salida = extractor(entrada)
    return salida.flatten(1).squeeze(0).cpu().tolist()

vector_prueba = extraer_embedding(resnet, Image.open(test["ruta_imagen"].iloc[0]).convert("RGB"))
print(f"Embedding ResNet-50 de prueba: {len(vector_prueba)} dimensiones (debe ser 2048).")
assert len(vector_prueba) == 2048
''')

    md(nb, """\
## 7. Fusión imagen + texto

Se usa el modelo de imagen con mejor F1-macro de validación (de los dos
de arriba) combinado con BETO (02_cu2_beto.ipynb, debe haber corrido
antes). El peso de la imagen en el promedio se barre entre 0 y 1 EN
VALIDACIÓN, y el que da mejor F1-macro es el que se reporta sobre
PRUEBA — así la elección del peso no "ve" el conjunto de prueba.""")

    code(nb, '''\
mejor_modelo_imagen = resnet if f1_resnet >= f1_efficientnet else efficientnet
nombre_mejor = "ResNet-50" if f1_resnet >= f1_efficientnet else "EfficientNet-B0"
print(f"Modelo de imagen para la fusión: {nombre_mejor}")

ruta_beto = CARPETA_MODELOS.parent / "cu2-beto-v1"
if not ruta_beto.exists():
    print(f"No se encontró {ruta_beto} — corre 02_cu2_beto.ipynb primero para evaluar la fusión. Se omite esta sección.")
else:
    from transformers import AutoModelForSequenceClassification as AMSC
    from transformers import AutoTokenizer as AT

    tokenizer_beto = AT.from_pretrained(ruta_beto)
    modelo_beto = AMSC.from_pretrained(ruta_beto).to(DISPOSITIVO).eval()
    clases_beto = [modelo_beto.config.id2label[i] for i in range(len(modelo_beto.config.id2label))]

    def probs_imagen(loader_df):
        mejor_modelo_imagen.eval()
        todas = []
        with torch.no_grad():
            for _, fila in loader_df.iterrows():
                img = Image.open(fila["ruta_imagen"]).convert("RGB")
                entrada = TRANSFORM_EVAL(img).unsqueeze(0).to(DISPOSITIVO)
                probs = torch.softmax(mejor_modelo_imagen(entrada), dim=1).squeeze(0).cpu()
                todas.append(probs)
        return torch.stack(todas)

    def probs_texto(loader_df):
        todas = []
        with torch.no_grad():
            for texto in loader_df["texto_es"]:
                entrada = tokenizer_beto(texto, return_tensors="pt", truncation=True, max_length=128).to(DISPOSITIVO)
                logits = modelo_beto(**entrada).logits
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu()
                todas.append(probs)
        return torch.stack(todas)

    # Asume que CLASES (orden del modelo de imagen) coincide con clases_beto —
    # ambos se entrenaron con sorted(df["categoria"].unique()) sobre la MISMA
    # partición, así que el orden debe ser idéntico; se valida explícitamente.
    assert CLASES == clases_beto, "Las clases de imagen y texto no coinciden — ¿misma partición?"

    probs_img_val, probs_txt_val = probs_imagen(val), probs_texto(val)
    y_val_idx = val["categoria"].map(LABEL2ID).tolist()

    mejor_peso, mejor_f1_fusion = 0.5, -1.0
    for peso in [i / 10 for i in range(0, 11)]:
        combinado = peso * probs_img_val + (1 - peso) * probs_txt_val
        pred = combinado.argmax(dim=1).tolist()
        f1 = f1_score(y_val_idx, pred, average="macro", zero_division=0)
        if f1 > mejor_f1_fusion:
            mejor_f1_fusion, mejor_peso = f1, peso
    print(f"Mejor peso de imagen en validación: {mejor_peso} (F1-macro val={mejor_f1_fusion:.4f})")

    probs_img_test, probs_txt_test = probs_imagen(test), probs_texto(test)
    y_test_idx = test["categoria"].map(LABEL2ID).tolist()
    combinado_test = mejor_peso * probs_img_test + (1 - mejor_peso) * probs_txt_test
    pred_test = combinado_test.argmax(dim=1).tolist()

    metricas_fusion = {
        "peso_imagen": mejor_peso,
        "accuracy": float(accuracy_score(y_test_idx, pred_test)),
        "f1_macro": float(f1_score(y_test_idx, pred_test, average="macro", zero_division=0)),
    }
    print("Fusión sobre PRUEBA:", json.dumps(metricas_fusion, indent=2))

    with open(CARPETA_MODELOS / "metricas_fusion.json", "w", encoding="utf-8") as f:
        json.dump(metricas_fusion, f, indent=2)
''')

    md(nb, "## 8. SQL para registrar los modelos en `modelos_ia`")
    code(nb, '''\
for nombre_bd, metricas_test in [
    ("cu1-resnet50-v1", metricas_resnet_test),
    ("cu1-efficientnet-b0-v1", metricas_efficientnet_test),
]:
    sql = f"""
UPDATE novastore.modelos_ia
   SET metricas = '{json.dumps(metricas_test)}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = '{nombre_bd}.pt'
 WHERE codigo = '{nombre_bd}';
"""
    (CARPETA_MODELOS / f"registro_modelo_{nombre_bd}.sql").write_text(sql, encoding="utf-8")
    print(sql)

cumple_oe1 = max(metricas_resnet_test["accuracy"], metricas_efficientnet_test["accuracy"]) >= 0.80 and \\
             max(metricas_resnet_test["f1_macro"], metricas_efficientnet_test["f1_macro"]) >= 0.75
print("Meta OE1 (accuracy>=0.80 y F1-macro>=0.75, mejor de los dos modelos):", "CUMPLIDA" if cumple_oe1 else "NO alcanzada todavía")
''')

    return nb


def main():
    CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)
    notebooks = {
        "00_preparar_dataset.ipynb": construir_00(),
        "01_cu2_baseline_tfidf.ipynb": construir_01(),
        "02_cu2_beto.ipynb": construir_02(),
        "03_cu1_imagen.ipynb": construir_03(),
    }
    for nombre, nb in notebooks.items():
        ruta = CARPETA_SALIDA / nombre
        nbf.write(nb, ruta)
        print(f"Escrito {ruta}")


if __name__ == "__main__":
    main()
