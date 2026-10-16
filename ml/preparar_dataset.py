"""Prepara el dataset de entrenamiento para CU1/CU2 a partir de
`Shopify/product-catalogue` (Hugging Face, Apache-2.0, ~48 300 productos).

Reutilizable desde los notebooks (`import preparar_dataset`) y ejecutable
solo (`python ml/preparar_dataset.py`). Ver ml/DATASET.md para las
fuentes, licencias y limitaciones completas.

Qué hace, en orden:
  1. Recorre el dataset (streaming, no descarga los 9.5 GB de golpe).
  2. Mapea `ground_truth_category` a una de las 21 categorías de NovaStore
     (mapeo_categorias.py) — descarta lo que no mapea.
  3. Descarta filas sin imagen o sin título, y duplicados exactos
     (mismo título+descripción).
  4. Corta cada clase en --max-por-clase ejemplos (300 por defecto).
  5. Guarda las imágenes a disco y reporta cuántos ejemplos quedaron por
     clase, avisando de las que tengan menos de 100.
  6. Si se pide (--complementar-abo, desactivado por defecto), intenta
     sumar ejemplos de Amazon Berkeley Objects para las clases débiles.
  7. Parte en train/val/test (70/15/15, estratificado, semilla 42) y
     guarda los tres CSV.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mapeo_categorias import CATEGORIAS, INDICE_CLASE, mapear_categoria  # noqa: E402

UMBRAL_CLASE_DEBIL = 100
SEMILLA = 42


def _normalizar_para_dedupe(titulo: str, descripcion: str) -> str:
    return f"{titulo.strip().lower()}||{(descripcion or '').strip().lower()}"


def _guardar_imagen(imagen, carpeta: Path, id_fila: int) -> str | None:
    """`imagen` es lo que trae la columna `product_image` del dataset de
    HF: un dict con bytes PIL-decodificables, o ya un objeto PIL.Image.
    Devuelve la ruta relativa guardada, o None si la imagen vino corrupta
    (pasa con un puñado de filas en datasets grandes scrapeados — se
    descartan en vez de romper la corrida completa)."""
    from PIL import Image
    import io

    try:
        if isinstance(imagen, dict) and "bytes" in imagen and imagen["bytes"]:
            img = Image.open(io.BytesIO(imagen["bytes"]))
        elif hasattr(imagen, "convert"):
            img = imagen
        else:
            return None
        img = img.convert("RGB")
    except Exception:
        return None

    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{id_fila}.jpg"
    img.save(carpeta / nombre, "JPEG", quality=90)
    return nombre


def construir_dataset(
    max_por_clase: int = 300,
    limite_filas: int | None = None,
    carpeta_salida: Path = Path("ml/datos"),
    mostrar_progreso: bool = True,
) -> pd.DataFrame:
    """Recorre Shopify/product-catalogue en modo streaming, filtra/mapea,
    guarda imágenes en carpeta_salida/imagenes/ y devuelve un DataFrame
    con id, titulo, descripcion, ruta_imagen, categoria, indice_clase."""
    from datasets import load_dataset

    carpeta_imagenes = carpeta_salida / "imagenes"
    ds = load_dataset("Shopify/product-catalogue", split="train", streaming=True)

    vistos: set[str] = set()
    conteo_por_clase: Counter[str] = Counter()
    filas: list[dict] = []
    id_siguiente = 0
    descartadas_imagen_corrupta = 0

    for i, fila in enumerate(ds):
        if limite_filas is not None and i >= limite_filas:
            break

        titulo = (fila.get("product_title") or "").strip()
        descripcion = (fila.get("product_description") or "").strip()
        categoria_cruda = fila.get("ground_truth_category") or ""
        imagen_cruda = fila.get("product_image")

        if not titulo or imagen_cruda is None:
            continue
        categoria = mapear_categoria(categoria_cruda)
        if categoria is None:
            continue
        if conteo_por_clase[categoria] >= max_por_clase:
            continue
        clave = _normalizar_para_dedupe(titulo, descripcion)
        if clave in vistos:
            continue

        ruta_imagen = _guardar_imagen(imagen_cruda, carpeta_imagenes, id_siguiente)
        if ruta_imagen is None:
            descartadas_imagen_corrupta += 1
            continue

        vistos.add(clave)
        conteo_por_clase[categoria] += 1
        filas.append(
            {
                "id": id_siguiente,
                "titulo": titulo,
                "descripcion": descripcion,
                "ruta_imagen": str((carpeta_imagenes / ruta_imagen)),
                "categoria": categoria,
                "indice_clase": INDICE_CLASE[categoria],
            }
        )
        id_siguiente += 1

        if mostrar_progreso and id_siguiente % 500 == 0:
            print(f"  ...{id_siguiente} ejemplos guardados ({i + 1} filas revisadas)")

        if all(conteo_por_clase[c] >= max_por_clase for c in CATEGORIAS):
            break

    del ds  # suelta el iterador en streaming antes de que el proceso termine

    df = pd.DataFrame(filas)
    _reportar_conteo(conteo_por_clase, descartadas_imagen_corrupta)
    return df


def _reportar_conteo(conteo_por_clase: Counter[str], descartadas_imagen_corrupta: int) -> None:
    print(f"\nTotal: {sum(conteo_por_clase.values())} ejemplos ({descartadas_imagen_corrupta} imágenes corruptas descartadas).")
    print("Por categoría:")
    debiles = []
    for categoria in CATEGORIAS:
        n = conteo_por_clase.get(categoria, 0)
        marca = ""
        if n < UMBRAL_CLASE_DEBIL:
            marca = "  <-- DÉBIL (menos de 100)"
            debiles.append(categoria)
        print(f"  [{INDICE_CLASE[categoria]:>2}] {categoria:<35} {n:>4}{marca}")

    if debiles:
        print(
            f"\nAviso: {len(debiles)} categoría(s) con menos de {UMBRAL_CLASE_DEBIL} ejemplos: {debiles}."
            "\nRevisa ml/mapeo_categorias.py para esas clases (puede faltar un prefijo real del"
            " dataset), o corre con --complementar-abo para sumar ejemplos de Amazon Berkeley Objects."
        )


def complementar_con_abo(
    df: pd.DataFrame, max_adicional_por_clase: int = 200, carpeta_salida: Path = Path("ml/datos")
) -> pd.DataFrame:
    """Complemento OPCIONAL (desactivado por defecto) para clases débiles,
    usando Amazon Berkeley Objects (CC BY 4.0): abo-listings (metadatos,
    item_name en locale es_US cuando existe) + abo-images-small.

    ABO no comparte taxonomía con Shopify/product-catalogue — no hay un
    mapeo de prefijos limpio como con GPT. Por eso este complemento usa
    una lista de palabras clave en `product_type` (el código de categoría
    de ABO, p. ej. "SHOES", "CHAIR") revisada a mano para las categorías
    de NovaStore más propensas a quedar débiles. No pretende ser
    exhaustivo: es un parche dirigido, no un segundo mapeo completo.
    """
    conteo_actual = df["categoria"].value_counts().to_dict()
    debiles = [c for c in CATEGORIAS if conteo_actual.get(c, 0) < UMBRAL_CLASE_DEBIL]
    if not debiles:
        print("Ninguna clase está débil — no hace falta complementar con ABO.")
        return df

    # product_type (ABO) -> categoría NovaStore. Palabras clave revisadas
    # a mano contra una muestra de abo-listings; revisable igual que
    # mapeo_categorias.py.
    ABO_PRODUCT_TYPE_A_CATEGORIA: dict[str, str] = {
        "SHOES": "Zapatillas y calzado",
        "CHAIR": "Muebles",
        "SOFA": "Muebles",
        "TABLE": "Muebles",
        "BED": "Muebles",
        "HOME_FURNITURE_AND_DECOR": "Decoración y menaje",
        "CELLULAR_PHONE_CASE": None,  # explícitamente no mapea a nada de NovaStore
        "SOUNDBAR": "Audio y audífonos",
        "HEADPHONES": "Audio y audífonos",
        "WATCH": "Relojes inteligentes y wearables",
        "OUTERWEAR": "Casacas y abrigos",
        "SHIRT": "Polos y camisas",
        "KITCHEN": "Electrodomésticos de cocina",
    }

    print(
        f"Complementando {len(debiles)} clase(s) débil(es) con ABO: {debiles}\n"
        "(requiere descargar abo-listings.tar y abo-images-small.tar de "
        "https://amazon-berkeley-objects.s3.amazonaws.com — varios GB, puede tardar)."
    )

    try:
        from ml.abo_complemento import cargar_candidatos_abo
    except ImportError:
        from abo_complemento import cargar_candidatos_abo  # type: ignore[no-redef]

    filas_nuevas = []
    id_siguiente = int(df["id"].max()) + 1 if len(df) else 0
    for categoria in debiles:
        faltan = UMBRAL_CLASE_DEBIL - conteo_actual.get(categoria, 0)
        objetivo = min(faltan + max_adicional_por_clase, max_adicional_por_clase)
        candidatos = cargar_candidatos_abo(categoria, ABO_PRODUCT_TYPE_A_CATEGORIA, limite=objetivo)
        for candidato in candidatos:
            ruta_imagen = _guardar_imagen(candidato["imagen"], carpeta_salida / "imagenes", id_siguiente)
            if ruta_imagen is None:
                continue
            filas_nuevas.append(
                {
                    "id": id_siguiente,
                    "titulo": candidato["titulo"],
                    "descripcion": candidato.get("descripcion", ""),
                    "ruta_imagen": str((carpeta_salida / "imagenes" / ruta_imagen)),
                    "categoria": categoria,
                    "indice_clase": INDICE_CLASE[categoria],
                }
            )
            id_siguiente += 1

    if not filas_nuevas:
        print("ABO no devolvió candidatos nuevos (revisa ABO_PRODUCT_TYPE_A_CATEGORIA).")
        return df

    print(f"+{len(filas_nuevas)} ejemplos sumados desde ABO.")
    return pd.concat([df, pd.DataFrame(filas_nuevas)], ignore_index=True)


def traducir_a_espanol(df: pd.DataFrame, tamano_lote: int = 16) -> pd.DataFrame:
    """Agrega la columna `texto_es`: título + descripción (truncada a 512
    caracteres) en español. Si el texto ya está en español, se copia tal
    cual; si no, se traduce con Helsinki-NLP/opus-mt-en-es.

    Limitación metodológica (documentada también en ml/DATASET.md): este
    modelo traduce INGLÉS -> español. Shopify/product-catalogue tiene
    productos en varios idiomas (se vieron títulos en sueco en una
    muestra real) — para un texto que no es inglés NI español, este
    modelo igual intenta traducirlo y el resultado puede ser de mala
    calidad o directamente incoherente. No se filtra por idioma de origen
    porque identificar automáticamente "inglés vs. otro no-español" con
    confianza, y descartar lo que no sea inglés, reduciría todavía más un
    dataset ya chico; se prefirió documentar la limitación y dejar que el
    equipo decida si vale la pena filtrar al revisar ml/DATASET.md.
    """
    from langdetect import DetectorFactory, LangDetectException, detect
    from transformers import pipeline

    DetectorFactory.seed = SEMILLA  # langdetect no es determinista si no se fija la semilla
    traductor = pipeline("translation", model="Helsinki-NLP/opus-mt-en-es", device=-1)

    textos_originales = [
        f"{fila.titulo} {(fila.descripcion or '')[:512]}".strip() for fila in df.itertuples()
    ]

    def es_espanol(texto: str) -> bool:
        try:
            return detect(texto) == "es"
        except LangDetectException:
            return False

    a_traducir_idx = [i for i, t in enumerate(textos_originales) if t and not es_espanol(t)]
    texto_es = list(textos_originales)

    for inicio in range(0, len(a_traducir_idx), tamano_lote):
        lote_idx = a_traducir_idx[inicio : inicio + tamano_lote]
        lote_textos = [textos_originales[i] for i in lote_idx]
        traducciones = traductor(lote_textos, max_length=200)
        for idx, traduccion in zip(lote_idx, traducciones):
            texto_es[idx] = traduccion["translation_text"]

    df = df.copy()
    df["texto_es"] = texto_es
    print(f"Traducidos {len(a_traducir_idx)}/{len(df)} textos (el resto ya estaba en español).")
    return df


MIN_EJEMPLOS_PARA_PARTIR = 10  # ver el porqué en el mensaje de error de abajo


def particionar(df: pd.DataFrame, seed: int = SEMILLA) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """70/15/15 estratificado por categoría, semilla fija — TODOS los
    notebooks deben usar exactamente esta partición para que las métricas
    sean comparables entre CU1, CU2 y la fusión."""
    from sklearn.model_selection import train_test_split

    conteo = df["categoria"].value_counts()
    debiles = conteo[conteo < MIN_EJEMPLOS_PARA_PARTIR]
    if len(debiles) > 0:
        raise ValueError(
            f"No se puede partir 70/15/15 de forma estratificada: {dict(debiles)} tienen menos de "
            f"{MIN_EJEMPLOS_PARA_PARTIR} ejemplos (con una partición en 3 estratificada, el 15% más "
            "chico necesita al menos un puñado de ejemplos de cada clase, o la partición falla o "
            "queda vacía para esa clase). Sube --max-por-clase, corre con --complementar-abo, o "
            "revisa ml/mapeo_categorias.py para esas clases."
        )

    train, resto = train_test_split(
        df, test_size=0.30, random_state=seed, stratify=df["categoria"]
    )
    val, test = train_test_split(
        resto, test_size=0.50, random_state=seed, stratify=resto["categoria"]
    )
    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


def guardar_particion(
    train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, carpeta: Path = Path("ml/datos")
) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    columnas = ["id", "titulo", "descripcion", "texto_es", "ruta_imagen", "indice_clase", "categoria"]
    train[columnas].to_csv(carpeta / "train.csv", index=False)
    val[columnas].to_csv(carpeta / "val.csv", index=False)
    test[columnas].to_csv(carpeta / "test.csv", index=False)
    print(f"\nGuardado: {len(train)} train / {len(val)} val / {len(test)} test en {carpeta}/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-por-clase", type=int, default=300)
    parser.add_argument("--limite-filas", type=int, default=None, help="Tope de filas del dataset a revisar (para pruebas rápidas).")
    parser.add_argument("--carpeta-salida", type=Path, default=Path("ml/datos"))
    parser.add_argument("--complementar-abo", action="store_true", default=False)
    args = parser.parse_args()

    print(f"Construyendo dataset (max {args.max_por_clase}/clase" + (f", límite {args.limite_filas} filas" if args.limite_filas else "") + ")...")
    df = construir_dataset(args.max_por_clase, args.limite_filas, args.carpeta_salida)

    if args.complementar_abo:
        df = complementar_con_abo(df, carpeta_salida=args.carpeta_salida)

    print("\nTraduciendo textos no-españoles (Helsinki-NLP/opus-mt-en-es)...")
    df = traducir_a_espanol(df)

    try:
        train, val, test = particionar(df)
    except ValueError as error:
        sys.exit(f"\n{error}")
    guardar_particion(train, val, test, args.carpeta_salida)


if __name__ == "__main__":
    main()
