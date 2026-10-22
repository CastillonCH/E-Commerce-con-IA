"""Prepara el dataset de entrenamiento para CU1/CU2.

Reutilizable desde los notebooks y los scripts de entrenamiento
(`import preparar_dataset`) y ejecutable solo:

    python ml/preparar_dataset.py                 # dataset completo recomendado
    python ml/preparar_dataset.py --solo-shopify  # como antes (solo Shopify)

Qué hace, en orden:
  1. Lee los candidatos de cada fuente SOLO como texto (sin imágenes):
     Shopify/product-catalogue (sus dos splits), y como complemento para
     las clases débiles Fashion Product Images (MIT) y Amazon Berkeley
     Objects (CC BY 4.0). Ver ml/fuentes_datos.py y ml/DATASET.md.
  2. Deduplica (mismo título+descripción) entre todas las fuentes.
  3. Elige hasta --max-por-clase ejemplos por categoría con semilla fija:
     primero Shopify (el dominio original), y completa con las otras
     fuentes, cada una con su propio tope (--max-extra-por-clase) para
     que ninguna fuente externa domine una clase.
  4. Baja y guarda solo las imágenes de las filas elegidas.
  5. Traduce al español lo que no esté en español (Helsinki-NLP/opus-mt-en-es,
     con caché en disco para no volver a traducir en la siguiente corrida).
  6. Parte en train/val/test (70/15/15, estratificado, semilla 42) y guarda
     los tres CSV + un reporte de conteos por clase y por fuente.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mapeo_categorias import CATEGORIAS, INDICE_CLASE  # noqa: E402

UMBRAL_CLASE_DEBIL = 100
SEMILLA = 42
FUENTES_POR_DEFECTO = ("shopify", "moda_kaggle", "abo")
PRIORIDAD_FUENTE = {"shopify": 0, "abo": 1, "moda_kaggle": 2}


def _clave_dedupe(titulo: str, descripcion: str) -> str:
    return " ".join(f"{titulo}||{descripcion}".lower().split())


def recolectar_candidatos(fuentes: tuple[str, ...], limite_filas: int | None, carpeta_cache: Path) -> pd.DataFrame:
    from fuentes_datos import CANDIDATOS

    partes = []
    for fuente in fuentes:
        print(f"\n[{fuente}] leyendo candidatos (solo texto)...", flush=True)
        if fuente == "shopify":
            df = CANDIDATOS[fuente](limite_filas=limite_filas)
        else:
            df = CANDIDATOS[fuente](carpeta_cache / fuente)
        print(f"[{fuente}] {len(df)} candidatos mapeados a alguna de las 21 categorías.")
        partes.append(df)
    df = pd.concat(partes, ignore_index=True)
    df["clave"] = [_clave_dedupe(t, d) for t, d in zip(df["titulo"], df["descripcion"])]
    df["prioridad"] = df["fuente"].map(PRIORIDAD_FUENTE)
    df = df.sort_values(["prioridad", "ref"]).drop_duplicates("clave").drop(columns="prioridad")
    return df.reset_index(drop=True)


def seleccionar(candidatos: pd.DataFrame, max_por_clase: int, max_extra_por_clase: int, semilla: int = SEMILLA) -> pd.DataFrame:
    """Por categoría: Shopify primero (muestra aleatoria con semilla si
    sobra), y el cupo restante se reparte por turnos entre las fuentes
    externas, cada una con tope `max_extra_por_clase`."""
    elegidas = []
    for categoria in CATEGORIAS:
        de_clase = candidatos[candidatos["categoria"] == categoria]
        por_fuente = {
            fuente: grupo.sample(frac=1.0, random_state=semilla)
            for fuente, grupo in de_clase.groupby("fuente")
        }
        tomadas = []
        shopify = por_fuente.pop("shopify", de_clase.iloc[0:0])
        tomadas.append(shopify.head(max_por_clase))
        cupo = max_por_clase - len(tomadas[0])
        usados = {f: 0 for f in por_fuente}
        while cupo > 0:
            avanzo = False
            for fuente in sorted(por_fuente, key=PRIORIDAD_FUENTE.get):
                if cupo == 0:
                    break
                if usados[fuente] < min(max_extra_por_clase, len(por_fuente[fuente])):
                    usados[fuente] += 1
                    cupo -= 1
                    avanzo = True
            if not avanzo:
                break
        for fuente, n in usados.items():
            tomadas.append(por_fuente[fuente].head(n))
        elegidas.append(pd.concat(tomadas))
    df = pd.concat(elegidas, ignore_index=True)
    df["id"] = range(len(df))
    df["id_imagen"] = df["id"]
    return df


def guardar_imagenes(df: pd.DataFrame, carpeta_imagenes: Path) -> pd.DataFrame:
    from fuentes_datos import GUARDAR_IMAGENES

    rutas: dict[str, str] = {}
    for fuente, grupo in df.groupby("fuente"):
        print(f"\n[{fuente}] descargando {len(grupo)} imágenes...", flush=True)
        rutas.update(GUARDAR_IMAGENES[fuente](grupo, carpeta_imagenes))
    df = df.assign(ruta_imagen=df["ref"].map(rutas))
    perdidas = df["ruta_imagen"].isna().sum()
    if perdidas:
        print(f"\n{perdidas} filas descartadas por imagen faltante o corrupta.")
    return df[df["ruta_imagen"].notna()].reset_index(drop=True)


def construir_dataset(
    max_por_clase: int = 500,
    limite_filas: int | None = None,
    carpeta_salida: Path = Path("ml/datos"),
    mostrar_progreso: bool = True,
    fuentes: tuple[str, ...] | None = None,
    max_extra_por_clase: int = 300,
) -> pd.DataFrame:
    """Devuelve un DataFrame con id, fuente, titulo, descripcion,
    ruta_imagen, categoria, indice_clase (y las imágenes ya en disco).

    `limite_filas` (pruebas rápidas) acota las filas de Shopify revisadas
    y, si no se piden `fuentes` explícitas, usa solo Shopify para no bajar
    los metadatos de las fuentes externas en una corrida de prueba."""
    carpeta_salida = Path(carpeta_salida)
    if fuentes is None:
        fuentes = ("shopify",) if limite_filas is not None else FUENTES_POR_DEFECTO
    candidatos = recolectar_candidatos(tuple(fuentes), limite_filas, carpeta_salida / "cache")
    df = seleccionar(candidatos, max_por_clase, max_extra_por_clase)
    df = guardar_imagenes(df, carpeta_salida / "imagenes")
    df["indice_clase"] = df["categoria"].map(INDICE_CLASE)
    if mostrar_progreso:
        reportar_conteo(df)
    return df


def reportar_conteo(df: pd.DataFrame) -> dict:
    tabla = pd.crosstab(df["categoria"], df["fuente"]).reindex(CATEGORIAS).fillna(0).astype(int)
    tabla["total"] = tabla.sum(axis=1)
    print(f"\nTotal: {len(df)} ejemplos.")
    print(tabla.to_string())
    debiles = tabla.index[tabla["total"] < UMBRAL_CLASE_DEBIL].tolist()
    if debiles:
        print(f"\nAviso: {len(debiles)} categoría(s) con menos de {UMBRAL_CLASE_DEBIL} ejemplos: {debiles}.")
    return {categoria: fila.to_dict() for categoria, fila in tabla.iterrows()}


def _texto_fuente(titulo: str, descripcion: str) -> str:
    """Mismo formato que arma ai-service al clasificar ("título. descripción"),
    para que BETO vea en producción lo mismo que vio al entrenar."""
    descripcion = (descripcion or "").strip()[:400]
    return f"{titulo.strip()}. {descripcion}".strip() if descripcion else titulo.strip()


def traducir_a_espanol(
    df: pd.DataFrame,
    tamano_lote: int = 32,
    carpeta_cache: Path | None = None,
) -> pd.DataFrame:
    """Agrega la columna `texto_es`: "título. descripción" en español. Lo
    que ya está en español se copia tal cual; el resto se traduce con
    Helsinki-NLP/opus-mt-en-es (búsqueda greedy: 2.4x más rápida que la
    de 4 haces y sin pérdida de calidad apreciable en las pruebas).

    Limitación metodológica (ver ml/DATASET.md): el traductor es inglés ->
    español; un texto en un tercer idioma se traduce igual y puede quedar
    de mala calidad."""
    import torch
    from langdetect import DetectorFactory, LangDetectException, detect
    from transformers import MarianMTModel, MarianTokenizer

    DetectorFactory.seed = SEMILLA
    textos = [_texto_fuente(t, d) for t, d in zip(df["titulo"], df["descripcion"].fillna(""))]
    idiomas = df["idioma"].tolist() if "idioma" in df.columns else [None] * len(df)

    ruta_cache = (carpeta_cache or Path(".")) / "traducciones.json"
    cache: dict[str, str] = {}
    if carpeta_cache is not None and ruta_cache.exists():
        cache = json.loads(ruta_cache.read_text(encoding="utf-8"))

    def es_espanol(texto: str, idioma) -> bool:
        if idioma == "es":
            return True
        try:
            return detect(texto) == "es"
        except LangDetectException:
            return False

    pendientes = sorted({t for t, i in zip(textos, idiomas) if t and t not in cache and not es_espanol(t, i)})
    print(f"Traduciendo {len(pendientes)} textos ({len(cache)} ya estaban en caché)...", flush=True)
    if pendientes:
        dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
        tokenizer = MarianTokenizer.from_pretrained("Helsinki-NLP/opus-mt-en-es")
        modelo = MarianMTModel.from_pretrained("Helsinki-NLP/opus-mt-en-es").to(dispositivo).eval()
        for inicio in range(0, len(pendientes), tamano_lote):
            lote = pendientes[inicio : inicio + tamano_lote]
            entrada = tokenizer(lote, return_tensors="pt", padding=True, truncation=True, max_length=256).to(dispositivo)
            with torch.no_grad():
                salida = modelo.generate(**entrada, num_beams=1, max_new_tokens=256)
            for original, traducido in zip(lote, tokenizer.batch_decode(salida, skip_special_tokens=True)):
                cache[original] = traducido
            if (inicio // tamano_lote) % 20 == 0:
                print(f"  ...{min(inicio + tamano_lote, len(pendientes))}/{len(pendientes)}", flush=True)
                if carpeta_cache is not None:
                    ruta_cache.parent.mkdir(parents=True, exist_ok=True)
                    ruta_cache.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        if carpeta_cache is not None:
            ruta_cache.parent.mkdir(parents=True, exist_ok=True)
            ruta_cache.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    df = df.copy()
    df["texto_es"] = [cache.get(t, t) for t in textos]
    return df


MIN_EJEMPLOS_PARA_PARTIR = 10  # ver el porqué en el mensaje de error de abajo


def particionar(
    df: pd.DataFrame,
    seed: int = SEMILLA,
    min_ejemplos: int = MIN_EJEMPLOS_PARA_PARTIR,
    estratificar: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """70/15/15 estratificado por categoría, semilla fija — TODOS los
    scripts y notebooks usan exactamente esta partición para que las
    métricas de CU1, CU2 y la fusión sean comparables.

    `estratificar=False` es solo para pruebas con datasets diminutos (la
    partición no sirve para medir nada). Con estratificar=True, una clase
    con menos de `min_ejemplos` corta la corrida: con menos de 10 ejemplos
    el 15% de test tiene 1 o 2 ejemplos de esa clase y su F1 (y por lo
    tanto el F1-macro) pasa a depender de acertar o fallar uno solo."""
    from sklearn.model_selection import train_test_split

    if not estratificar:
        train, resto = train_test_split(df, test_size=0.30, random_state=seed)
        val, test = train_test_split(resto, test_size=0.50, random_state=seed)
        return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)

    conteo = df["categoria"].value_counts()
    debiles = conteo[conteo < min_ejemplos]
    if len(debiles) > 0:
        raise ValueError(
            f"No se puede partir 70/15/15 de forma estratificada: {dict(debiles)} tienen menos de "
            f"{min_ejemplos} ejemplos. Usa las fuentes complementarias (sin --solo-shopify) o revisa "
            "ml/mapeo_categorias.py para esas clases."
        )

    train, resto = train_test_split(df, test_size=0.30, random_state=seed, stratify=df["categoria"])
    val, test = train_test_split(resto, test_size=0.50, random_state=seed, stratify=resto["categoria"])
    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


COLUMNAS_PARTICION = ["id", "fuente", "titulo", "descripcion", "texto_es", "ruta_imagen", "indice_clase", "categoria"]


def guardar_particion(
    train: pd.DataFrame, val: pd.DataFrame, test: pd.DataFrame, carpeta: Path = Path("ml/datos")
) -> None:
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    for nombre, parte in (("train", train), ("val", val), ("test", test)):
        if "fuente" not in parte.columns:
            parte = parte.assign(fuente="shopify")
        parte[COLUMNAS_PARTICION].to_csv(carpeta / f"{nombre}.csv", index=False)
    reporte = {
        "particion": {"train": len(train), "val": len(val), "test": len(test)},
        "por_clase_y_fuente": reportar_conteo(pd.concat([train, val, test])) if "fuente" in train.columns else {},
    }
    (carpeta / "reporte_dataset.json").write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nGuardado: {len(train)} train / {len(val)} val / {len(test)} test en {carpeta}/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-por-clase", type=int, default=500)
    parser.add_argument("--max-extra-por-clase", type=int, default=300,
                        help="Tope por clase para CADA fuente complementaria (moda_kaggle, abo).")
    parser.add_argument("--limite-filas", type=int, default=None, help="Tope de filas de Shopify (pruebas rápidas).")
    parser.add_argument("--carpeta-salida", type=Path, default=Path(__file__).resolve().parent / "datos")
    parser.add_argument("--solo-shopify", action="store_true", help="No usar las fuentes complementarias.")
    args = parser.parse_args()

    fuentes = ("shopify",) if args.solo_shopify else FUENTES_POR_DEFECTO
    print(f"Construyendo dataset: fuentes={fuentes}, max {args.max_por_clase}/clase "
          f"(máx. {args.max_extra_por_clase} por fuente complementaria)")
    df = construir_dataset(args.max_por_clase, args.limite_filas, args.carpeta_salida,
                           fuentes=fuentes, max_extra_por_clase=args.max_extra_por_clase)
    df = traducir_a_espanol(df, carpeta_cache=args.carpeta_salida / "cache")
    try:
        train, val, test = particionar(df)
    except ValueError as error:
        sys.exit(f"\n{error}")
    guardar_particion(train, val, test, args.carpeta_salida)


if __name__ == "__main__":
    main()
