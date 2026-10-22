"""Fuentes de datos para el dataset de entrenamiento de CU1/CU2.

Cada fuente se recorre en dos pasos para no descargar más de lo necesario:
  1. `candidatos_*()` lee SOLO texto/categoría y devuelve un DataFrame con
     una fila por producto mapeado a una de las 21 categorías de NovaStore.
  2. `guardar_imagenes_*()` baja la imagen solo de las filas que
     preparar_dataset.py terminó eligiendo.

Fuentes (licencias verificadas — ver ml/DATASET.md):
  - shopify: Shopify/product-catalogue (Hugging Face, Apache-2.0). Se usan
    sus DOS splits (train y test, 48 289 productos); antes solo se usaba
    train y eso dejaba fuera ~20% de los ejemplos de las clases débiles.
  - moda_kaggle: Fashion Product Images (Small), Param Aggarwal, licencia
    MIT (Kaggle), espejo en Hugging Face ashraq/fashion-product-images-small.
    Imágenes de 60x80 px: preparar_dataset.py y entrenar_cu1.py compensan
    esa diferencia de resolución (ver DATASET.md, "Sesgo por fuente").
  - abo: Amazon Berkeley Objects (CC BY 4.0), metadatos e imágenes "small"
    descargados archivo por archivo desde su bucket público de S3 (no hace
    falta bajar los tar de varios GB).

Columnas de los candidatos: fuente, ref, titulo, descripcion, categoria,
idioma ("es" si el título ya viene en español, None si no se sabe).
"""

from __future__ import annotations

import gzip
import io
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from mapeo_categorias import CATEGORIAS, mapear_categoria

REPO_SHOPIFY = "Shopify/product-catalogue"
REPO_MODA = "ashraq/fashion-product-images-small"
ABO_BASE_URL = "https://amazon-berkeley-objects.s3.amazonaws.com"
ABO_ARCHIVOS_LISTINGS = [f"listings/metadata/listings_{h}.json.gz" for h in "0123456789abcdef"]
ABO_INDICE_IMAGENES = "images/metadata/images.csv.gz"


LADO_MAXIMO_IMAGEN = 512  # el entrenamiento recorta a 224: guardar más grande solo frena la lectura


def guardar_jpeg(imagen_bytes: bytes | None, destino: Path) -> bool:
    """Valida y guarda una imagen como JPEG RGB (lado mayor <= 512 px).
    Devuelve False si vino vacía o corrupta (se descarta la fila en vez de
    romper la corrida)."""
    from PIL import Image

    if not imagen_bytes:
        return False
    try:
        img = Image.open(io.BytesIO(imagen_bytes))
        img = img.convert("RGB")
        img.thumbnail((LADO_MAXIMO_IMAGEN, LADO_MAXIMO_IMAGEN))
    except Exception:
        return False
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.save(destino, "JPEG", quality=92)
    return True


# --- Shopify/product-catalogue ------------------------------------------------

def _archivos_shopify(splits: tuple[str, ...]) -> list[str]:
    from huggingface_hub import HfFileSystem

    fs = HfFileSystem()
    archivos = sorted(fs.glob(f"datasets/{REPO_SHOPIFY}/data/*.parquet"))
    return [a for a in archivos if a.rsplit("/", 1)[-1].split("-", 1)[0] in splits]


def candidatos_shopify(splits: tuple[str, ...] = ("train", "test"), limite_filas: int | None = None) -> pd.DataFrame:
    import pyarrow.parquet as pq
    from huggingface_hub import HfFileSystem

    fs = HfFileSystem()
    columnas = ["product_title", "product_description", "ground_truth_category"]
    partes = []
    revisadas = 0
    for archivo in _archivos_shopify(splits):
        if limite_filas is not None and revisadas >= limite_filas:
            break
        with fs.open(archivo, "rb", block_size=4 * 1024 * 1024) as f:
            tabla = pq.ParquetFile(f).read(columns=columnas).to_pandas()
        tabla["ref"] = [f"{archivo}::{i}" for i in range(len(tabla))]
        if limite_filas is not None:
            tabla = tabla.head(limite_filas - revisadas)
        revisadas += len(tabla)
        partes.append(tabla)
        print(f"  shopify: {archivo.rsplit('/', 1)[-1]} ({len(tabla)} filas)", flush=True)

    df = pd.concat(partes, ignore_index=True)
    df["categoria"] = df["ground_truth_category"].fillna("").map(mapear_categoria)
    df["titulo"] = df["product_title"].fillna("").str.strip()
    df["descripcion"] = df["product_description"].fillna("").str.strip()
    df = df[(df["titulo"] != "") & df["categoria"].notna()]
    df = df.assign(fuente="shopify", idioma=None)
    return df[["fuente", "ref", "titulo", "descripcion", "categoria", "idioma"]].reset_index(drop=True)


def guardar_imagenes_shopify(seleccion: pd.DataFrame, carpeta: Path) -> dict[str, str]:
    """Baja SOLO los grupos de filas del parquet que contienen filas
    elegidas. Devuelve ref -> ruta de la imagen guardada."""
    import pyarrow.parquet as pq
    from huggingface_hub import HfFileSystem

    fs = HfFileSystem()
    rutas: dict[str, str] = {}
    por_archivo: dict[str, list[tuple[int, str, str]]] = {}
    for fila in seleccion.itertuples():
        archivo, indice = fila.ref.rsplit("::", 1)
        por_archivo.setdefault(archivo, []).append((int(indice), fila.ref, fila.id_imagen))

    for archivo, filas in sorted(por_archivo.items()):
        with fs.open(archivo, "rb", block_size=8 * 1024 * 1024) as f:
            pf = pq.ParquetFile(f)
            limites, acumulado = [], 0
            for g in range(pf.metadata.num_row_groups):
                n = pf.metadata.row_group(g).num_rows
                limites.append((acumulado, acumulado + n))
                acumulado += n
            for g, (inicio, fin) in enumerate(limites):
                del_grupo = [x for x in filas if inicio <= x[0] < fin]
                if not del_grupo:
                    continue
                imagenes = pf.read_row_group(g, columns=["product_image"]).column(0).to_pylist()
                for indice, ref, id_imagen in del_grupo:
                    dato = imagenes[indice - inicio] or {}
                    destino = carpeta / f"{id_imagen}.jpg"
                    if guardar_jpeg(dato.get("bytes"), destino):
                        rutas[ref] = str(destino)
        print(f"  shopify imágenes: {archivo.rsplit('/', 1)[-1]} ({len(filas)} elegidas)", flush=True)
    return rutas


# --- Fashion Product Images (MIT) ------------------------------------------------

# articleType -> categoría. "Ropa deportiva" se decide por `usage == Sports`
# (ver _categoria_moda) para que un polo deportivo no caiga en "Polos y camisas".
MODA_ARTICLE_TYPE: dict[str, str] = {
    "Tshirts": "Polos y camisas",
    "Shirts": "Polos y camisas",
    "Tops": "Polos y camisas",
    "Jackets": "Casacas y abrigos",
    "Rain Jacket": "Casacas y abrigos",
    "Casual Shoes": "Zapatillas y calzado",
    "Sports Shoes": "Zapatillas y calzado",
    "Formal Shoes": "Zapatillas y calzado",
    "Sandals": "Zapatillas y calzado",
    "Sports Sandals": "Zapatillas y calzado",
    "Flip Flops": "Zapatillas y calzado",
    "Heels": "Zapatillas y calzado",
    "Flats": "Zapatillas y calzado",
    "Watches": "Relojes inteligentes y wearables",
    "Perfume and Body Mist": "Fragancias",
    "Fragrance Gift Set": "Fragancias",
    "Lipstick": "Maquillaje",
    "Lip Gloss": "Maquillaje",
    "Lip Liner": "Maquillaje",
    "Lip Plumper": "Maquillaje",
    "Nail Polish": "Maquillaje",
    "Kajal and Eyeliner": "Maquillaje",
    "Foundation and Primer": "Maquillaje",
    "Mascara": "Maquillaje",
    "Eyeshadow": "Maquillaje",
    "Compact": "Maquillaje",
    "Highlighter and Blush": "Maquillaje",
    "Concealer": "Maquillaje",
    "Track Pants": "Ropa deportiva",
    "Tracksuits": "Ropa deportiva",
}
MODA_ROPA_DEPORTIVA_SI_USO_SPORTS = {"Tshirts", "Shorts", "Track Pants", "Tracksuits", "Sweatshirts", "Tights", "Capris", "Jackets"}


def _categoria_moda(article_type: str, uso: str | None) -> str | None:
    if uso == "Sports" and article_type in MODA_ROPA_DEPORTIVA_SI_USO_SPORTS:
        return "Ropa deportiva"
    return MODA_ARTICLE_TYPE.get(article_type)


def _archivos_moda(carpeta_cache: Path) -> list[Path]:
    from huggingface_hub import hf_hub_download, list_repo_files

    nombres = sorted(f for f in list_repo_files(REPO_MODA, repo_type="dataset") if f.endswith(".parquet"))
    return [Path(hf_hub_download(REPO_MODA, n, repo_type="dataset", cache_dir=str(carpeta_cache))) for n in nombres]


def candidatos_moda(carpeta_cache: Path) -> pd.DataFrame:
    import pyarrow.parquet as pq

    partes = []
    for ruta in _archivos_moda(carpeta_cache):
        tabla = pq.read_table(ruta, columns=["articleType", "usage", "productDisplayName"]).to_pandas()
        tabla["ref"] = [f"{ruta}::{i}" for i in range(len(tabla))]
        partes.append(tabla)
    df = pd.concat(partes, ignore_index=True)
    df["categoria"] = [_categoria_moda(a, u) for a, u in zip(df["articleType"], df["usage"])]
    df["titulo"] = df["productDisplayName"].fillna("").str.strip()
    df = df[(df["titulo"] != "") & df["categoria"].notna()]
    df = df.assign(fuente="moda_kaggle", descripcion="", idioma=None)
    return df[["fuente", "ref", "titulo", "descripcion", "categoria", "idioma"]].reset_index(drop=True)


def guardar_imagenes_moda(seleccion: pd.DataFrame, carpeta: Path) -> dict[str, str]:
    import pyarrow.parquet as pq

    rutas: dict[str, str] = {}
    por_archivo: dict[str, list] = {}
    for fila in seleccion.itertuples():
        archivo, indice = fila.ref.rsplit("::", 1)
        por_archivo.setdefault(archivo, []).append((int(indice), fila.ref, fila.id_imagen))
    for archivo, filas in por_archivo.items():
        imagenes = pq.read_table(archivo, columns=["image"]).column(0).to_pylist()
        for indice, ref, id_imagen in filas:
            destino = carpeta / f"{id_imagen}.jpg"
            if guardar_jpeg((imagenes[indice] or {}).get("bytes"), destino):
                rutas[ref] = str(destino)
    return rutas


# --- Amazon Berkeley Objects (CC BY 4.0) ------------------------------------------

# product_type de ABO -> categoría, con un filtro opcional sobre el nombre
# del producto. Revisado contra nombres reales: RECREATION_BALL mezcla
# balones con medicine balls de gimnasio, y TOY_FIGURE/TOYS_AND_GAMES son
# casi todos peluches (Jam & Honey) — por eso los filtros. Se dejaron FUERA
# a propósito: NOTEBOOK_COMPUTER/PERSONAL_COMPUTER/COMPUTER (traen cables,
# hubs y brazos de monitor) y NON_RIDING_TOY_VEHICLE (traía baterías).
_PATRON_BALON = re.compile(r"\b(soccer|football|basketball|volleyball|rugby|handball|bal[oó]n|pelota de f[uú]tbol)\b", re.I)
_PATRON_NO_BALON = re.compile(r"\b(medicine|slam|wall ball|stability|exercise|yoga|massage|stress|goal|pump|bag|net)\b", re.I)
_PATRON_PELUCHE = re.compile(r"(jam (&|and) honey|teddy|plush|soft toy|stuffed|peluche)", re.I)

ABO_PRODUCT_TYPE: dict[str, tuple[str, object]] = {
    "SHOES": ("Zapatillas y calzado", None),
    "BOOT": ("Zapatillas y calzado", None),
    "SANDAL": ("Zapatillas y calzado", None),
    "TECHNICAL_SPORT_SHOE": ("Zapatillas y calzado", None),
    "WATCH": ("Relojes inteligentes y wearables", None),
    "RECREATION_BALL": ("Balones", lambda t: bool(_PATRON_BALON.search(t)) and not _PATRON_NO_BALON.search(t)),
    "TOY_FIGURE": ("Peluches", lambda t: bool(_PATRON_PELUCHE.search(t))),
    "TOYS_AND_GAMES": ("Peluches", lambda t: bool(_PATRON_PELUCHE.search(t))),
    "TOY_BUILDING_BLOCK": ("Bloques de construcción", None),
    "LIP_COLOR": ("Maquillaje", None),
    "EYELID_COLOR": ("Maquillaje", None),
    "MASCARA": ("Maquillaje", None),
    "EYEBROW_COLOR": ("Maquillaje", None),
    "FACE_SHAPING_MAKEUP": ("Maquillaje", None),
    "NAIL_POLISH": ("Maquillaje", None),
    "SKIN_FOUNDATION_CONCEALER": ("Maquillaje", None),
    "COSMETIC_POWDER": ("Maquillaje", None),
    "COSMETIC_BRUSH": ("Herramientas de belleza", None),
    "HAIR_IRON": ("Herramientas de belleza", None),
}


def _descargar(url: str, destino: Path) -> Path:
    if destino.exists() and destino.stat().st_size > 0:
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_suffix(destino.suffix + ".parcial")
    urllib.request.urlretrieve(url, temporal)
    temporal.replace(destino)
    return destino


def _nombre_preferido(registro: dict) -> tuple[str | None, str | None]:
    """Prefiere el nombre en español (ABO tiene es_MX/es_ES/es_US para
    parte del catálogo), si no el inglés; otros idiomas se descartan
    porque el traductor del pipeline es solo inglés -> español."""
    nombres = registro.get("item_name") or []
    for prefijo, idioma in (("es", "es"), ("en", None)):
        for n in nombres:
            if (n.get("language_tag") or "").startswith(prefijo) and n.get("value"):
                return n["value"].strip(), idioma
    return None, None


def candidatos_abo(carpeta_cache: Path) -> pd.DataFrame:
    rutas_imagen: dict[str, str] = {}
    with gzip.open(_descargar(f"{ABO_BASE_URL}/{ABO_INDICE_IMAGENES}", carpeta_cache / "images.csv.gz"), "rt", encoding="utf-8") as f:
        next(f)
        for linea in f:
            partes = linea.rstrip("\n").split(",")
            if len(partes) >= 4:
                rutas_imagen[partes[0]] = partes[3]

    filas = []
    for nombre in ABO_ARCHIVOS_LISTINGS:
        ruta = _descargar(f"{ABO_BASE_URL}/{nombre}", carpeta_cache / Path(nombre).name)
        with gzip.open(ruta, "rt", encoding="utf-8") as f:
            for linea in f:
                registro = json.loads(linea)
                tipo = (registro.get("product_type") or [{}])[0].get("value")
                if tipo not in ABO_PRODUCT_TYPE:
                    continue
                categoria, filtro = ABO_PRODUCT_TYPE[tipo]
                titulo, idioma = _nombre_preferido(registro)
                id_imagen = registro.get("main_image_id")
                if not titulo or id_imagen not in rutas_imagen:
                    continue
                if filtro is not None and not filtro(titulo):
                    continue
                filas.append({
                    "fuente": "abo",
                    "ref": rutas_imagen[id_imagen],
                    "titulo": titulo,
                    "descripcion": "",
                    "categoria": categoria,
                    "idioma": idioma,
                })
    df = pd.DataFrame(filas)
    # El mismo producto aparece en varios mercados/tallas con la MISMA foto:
    # sin esto, copias casi idénticas caerían a la vez en train y en test.
    return df.drop_duplicates("ref").reset_index(drop=True)


def guardar_imagenes_abo(seleccion: pd.DataFrame, carpeta: Path, hilos: int = 16) -> dict[str, str]:
    def bajar(fila) -> tuple[str, str | None]:
        url = f"{ABO_BASE_URL}/images/small/{fila.ref}"
        destino = carpeta / f"{fila.id_imagen}.jpg"
        try:
            with urllib.request.urlopen(url, timeout=60) as respuesta:
                datos = respuesta.read()
        except Exception:
            return fila.ref, None
        return fila.ref, (str(destino) if guardar_jpeg(datos, destino) else None)

    with ThreadPoolExecutor(max_workers=hilos) as pool:
        resultados = list(pool.map(bajar, seleccion.itertuples()))
    return {ref: ruta for ref, ruta in resultados if ruta}


CANDIDATOS = {"shopify": candidatos_shopify, "moda_kaggle": candidatos_moda, "abo": candidatos_abo}
GUARDAR_IMAGENES = {"shopify": guardar_imagenes_shopify, "moda_kaggle": guardar_imagenes_moda, "abo": guardar_imagenes_abo}

assert {c for c, _ in ABO_PRODUCT_TYPE.values()} <= set(CATEGORIAS)
assert set(MODA_ARTICLE_TYPE.values()) <= set(CATEGORIAS)
