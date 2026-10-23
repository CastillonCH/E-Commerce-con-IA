"""Construye los 4 notebooks de ml/notebooks/*.ipynb con nbformat, en vez
de escribir el JSON a mano. Correr `python _build_notebooks.py` después
de editar este archivo para regenerarlos.

Los notebooks 01-03 son envoltorios finos de los scripts de entrenamiento
(entrenar_cu2_tfidf.py, entrenar_cu2_beto.py, entrenar_cu1.py,
evaluar_fusion.py): así hay UN solo lugar con la lógica de entrenamiento,
y Colab y una PC local (docs/ENTRENAMIENTO_LOCAL.md) entrenan exactamente
lo mismo.
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


# id fijo por posición: regenerar sin cambios no ensucia el diff de git.
def md(nb, texto):
    nb["cells"].append(nbf.v4.new_markdown_cell(texto, id=f"celda-{len(nb['cells']):02d}"))


def code(nb, texto):
    nb["cells"].append(nbf.v4.new_code_cell(texto, id=f"celda-{len(nb['cells']):02d}"))


CELDA_INSTALAR = '''\
# Si ya corriste esta celda en esta sesión de Colab, puedes saltarla.
import os
import sys
from pathlib import Path

EN_COLAB = "google.colab" in sys.modules

if EN_COLAB:
    from google.colab import drive
    drive.mount("/content/drive")
    CARPETA_ML = "/content/drive/MyDrive/NovaStore_IA/ml"
    get_ipython().system(f"pip install -q -r {CARPETA_ML}/requirements.txt")
else:
    # Ejecución local (verificación, no Colab): la carpeta ml/ del repo.
    CARPETA_ML = str(Path.cwd())

os.chdir(CARPETA_ML)
sys.path.insert(0, CARPETA_ML)
print("CARPETA_ML =", CARPETA_ML)
'''

CELDA_MODO_RAPIDO = '''\
MODO_RAPIDO = False  # True = pocas filas y 1 época: solo para probar que corre (métricas sin valor)

if MODO_RAPIDO:
    # Si todavía no corriste 00_preparar_dataset, genera un dataset sintético
    # diminuto para poder probar la plomería (no sirve para medir nada).
    from _modo_rapido_fallback import generar_si_falta
    generar_si_falta(Path(CARPETA_ML) / "datos")

import torch
print("GPU disponible:", torch.cuda.is_available())
if not torch.cuda.is_available():
    print("Sin GPU: en Colab, activa Entorno de ejecución -> Cambiar tipo de entorno -> T4 GPU.")
'''


def celda_mostrar(codigo: str) -> str:
    return f'''\
import json
from IPython.display import Image as MostrarImagen, display

carpeta = Path(CARPETA_ML) / "modelos" / "{codigo}"
metricas = json.loads((carpeta / "metricas.json").read_text(encoding="utf-8"))
print({{k: v for k, v in metricas.items() if k in ("accuracy", "f1_macro", "f1_weighted", "n")}})
print("Por fuente:", json.dumps(metricas.get("por_fuente", {{}}), indent=2, ensure_ascii=False))
for nombre in ("curvas_entrenamiento.png", "matriz_confusion.png"):
    if (carpeta / nombre).exists():
        display(MostrarImagen(filename=str(carpeta / nombre)))
'''


def construir_00():
    nb = nb_nuevo()
    md(nb, """\
# 00 — Preparar el dataset

Arma el dataset de entrenamiento con tres fuentes de licencia abierta
(ver `ml/DATASET.md`): `Shopify/product-catalogue` (Apache-2.0, la
principal), Fashion Product Images (MIT) y Amazon Berkeley Objects
(CC BY 4.0) para completar las clases que Shopify casi no tiene. Mapea
todo a las 21 categorías de NovaStore, traduce a español lo que haga
falta y guarda `train.csv`/`val.csv`/`test.csv` en tu Google Drive —
**todos los demás notebooks leen esa misma partición**, así que corre este
primero.

Tiempo estimado en Colab con GPU T4: 15-30 minutos (descarga ~10 GB de
Shopify, pero solo guarda las ~6 500 imágenes elegidas).""")

    code(nb, CELDA_INSTALAR)

    code(nb, '''\
MODO_RAPIDO = False  # True = solo Shopify, 3000 filas revisadas, 5 ejemplos/clase: para probar que corre
CARPETA_DATOS = Path(CARPETA_ML) / "datos"
MAX_POR_CLASE = 5 if MODO_RAPIDO else 500
LIMITE_FILAS = 3000 if MODO_RAPIDO else None

print(f"MODO_RAPIDO={MODO_RAPIDO} · max_por_clase={MAX_POR_CLASE} · limite_filas={LIMITE_FILAS}")
''')

    md(nb, """\
## 1. Elegir productos y bajar sus imágenes

`construir_dataset` lee primero solo el texto y la categoría de cada
fuente, elige hasta `MAX_POR_CLASE` productos por categoría (Shopify
primero, máximo 300 por fuente complementaria) y recién ahí baja las
imágenes de los elegidos. Al final imprime una tabla de ejemplos por
categoría y por fuente.""")

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

Lo que `langdetect` no identifica como español se traduce con
`Helsinki-NLP/opus-mt-en-es` (con caché en `datos/cache/`). Ver la
limitación metodológica (textos en un tercer idioma) en `ml/DATASET.md`.""")

    code(nb, '''\
from preparar_dataset import traducir_a_espanol

df = traducir_a_espanol(df, carpeta_cache=CARPETA_DATOS / "cache")
df[["titulo", "texto_es"]].sample(min(5, len(df)))
''')

    md(nb, "## 3. Partir en train/val/test (70/15/15, semilla 42) y guardar")

    code(nb, '''\
from preparar_dataset import guardar_particion, particionar

train, val, test = particionar(df, estratificar=not MODO_RAPIDO)
guardar_particion(train, val, test, CARPETA_DATOS)
''')

    md(nb, "## 4. Revisar: algunos ejemplos con imagen")

    code(nb, '''\
import matplotlib.pyplot as plt
from PIL import Image

muestra = train.sample(min(8, len(train)), random_state=42)
fig, ejes = plt.subplots(2, 4, figsize=(14, 7))
for ax, (_, fila) in zip(ejes.flat, muestra.iterrows()):
    try:
        ax.imshow(Image.open(fila["ruta_imagen"]))
    except Exception:
        pass
    ax.set_title(f'{fila["categoria"]} ({fila["fuente"]})', fontsize=9)
    ax.axis("off")
plt.tight_layout()
plt.show()
''')
    return nb


def construir_01():
    nb = nb_nuevo()
    md(nb, """\
# 01 — CU2 baseline: TF-IDF + Regresión logística

Modelo simple de referencia para texto. La meta del T1 (OE2) es que BETO
(notebook 02) **supere** a este baseline, no solo que llegue a F1-macro ≥
0,85 — por eso el baseline sigue siendo una regresión logística, pero
bien hecha: TF-IDF de palabras (1-2 gramas) y de caracteres (2-5 gramas),
`C` elegido en validación y pesos de clase balanceados.

Corre `entrenar_cu2_tfidf.py` (la misma lógica que en una PC local, ver
`docs/ENTRENAMIENTO_LOCAL.md`). Tarda unos minutos y no necesita GPU.""")
    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_MODO_RAPIDO)
    md(nb, "## Entrenar y evaluar en el conjunto de PRUEBA")
    code(nb, 'get_ipython().system("python entrenar_cu2_tfidf.py")\n')
    md(nb, "## Resultados")
    code(nb, celda_mostrar("cu2-tfidf-logreg-v1"))
    return nb


def construir_02():
    nb = nb_nuevo()
    md(nb, """\
# 02 — CU2: fine-tuning de BETO

Ajusta `dccuchile/bert-base-spanish-wwm-cased` (BETO) a las 21
categorías. Meta (OE2): F1-macro ≥ 0,85 en el conjunto de prueba y
superar al baseline del notebook 01.

Corre `entrenar_cu2_beto.py`: hasta 15 épocas con early stopping
(paciencia 3) sobre el F1-macro de validación, cabeza con LR 10x mayor
que el encoder, pérdida con pesos por clase + label smoothing, warmup +
decaimiento lineal y fp16 en GPU. Ver por qué en
`docs/MEJORA_MODELOS_IA.md`.

Tiempo estimado con GPU T4: del orden de 15-30 minutos.""")
    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_MODO_RAPIDO)
    md(nb, "## Entrenar y evaluar en el conjunto de PRUEBA")
    code(nb, 'get_ipython().system("python entrenar_cu2_beto.py" + (" --modo-rapido" if MODO_RAPIDO else " --reanudar"))\n')
    md(nb, "## Resultados")
    code(nb, celda_mostrar("cu2-beto-v1"))
    return nb


def construir_03():
    nb = nb_nuevo()
    md(nb, """\
# 03 — CU1: ResNet-50 + EfficientNet-B0, y fusión imagen + texto

ResNet-50 (cu1-resnet50-v1) y EfficientNet-B0 (cu1-efficientnet-b0-v1)
desde ImageNet con LP-FT: primero una sonda lineal (solo la última capa,
con la red congelada; aparece como "época 0") y después fine-tuning
completo con LR bajo. Meta (OE1): accuracy ≥ 0,80 y
F1-macro ≥ 0,75 en el conjunto de prueba.

Corre `entrenar_cu1.py` y después `evaluar_fusion.py`, que elige en
validación el peso de la imagen al combinarla con el texto (con la misma
fórmula que usa ai-service) — ese valor va en `PESO_FUSION_IMAGEN` de
`ai-service/.env`. Corre antes los notebooks 01 y/o 02: la fusión
necesita un modelo de texto entrenado.

Tiempo estimado con GPU T4: del orden de 45-90 minutos para las dos
arquitecturas. Cada mejora se guarda en Drive (`modelo.pt`): si Colab se
desconecta, no se pierde el mejor checkpoint hasta ese momento.""")
    code(nb, CELDA_INSTALAR)
    code(nb, CELDA_MODO_RAPIDO)
    md(nb, "## Entrenar ResNet-50 y EfficientNet-B0")
    code(nb, 'get_ipython().system("python entrenar_cu1.py" + (" --modo-rapido" if MODO_RAPIDO else " --reanudar"))\n')
    md(nb, "## Resultados por arquitectura")
    code(nb, celda_mostrar("cu1-resnet50-v1"))
    code(nb, celda_mostrar("cu1-efficientnet-b0-v1"))
    md(nb, "## Fusión imagen + texto")
    code(nb, 'get_ipython().system("python evaluar_fusion.py")\n')
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
