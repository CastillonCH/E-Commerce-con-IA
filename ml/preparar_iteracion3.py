"""Arma el dataset de la iteración 3 SIN tocar validación ni prueba.

La iteración 2 se midió con 980 productos de validación y 981 de prueba.
Para que la comparación sea justa, la iteración 3 usa exactamente esos
mismos dos conjuntos y solo cambia el ENTRENAMIENTO:

  A. Sobremuestreo: las categorías con menos de --minimo ejemplos de
     entrenamiento se repiten hasta llegar a ese número. Cada repetición
     se ve distinta porque el entrenamiento aplica aumento de datos
     (recortes, giros, color) a cada foto.
  B. Datos propios de NovaStore (opcional, --propios): fichas reales con
     foto, título, descripción y categoría (plantilla en
     ml/plantilla_datos_propios.csv). Se descartan las que se parecen a
     un producto de validación o de prueba (mismo título o misma foto),
     para no hacer trampa.

Uso, desde la raíz del proyecto:
    python ml/preparar_iteracion3.py
    python ml/preparar_iteracion3.py --propios ml/datos_propios/fichas.csv
Luego, para entrenar con este dataset (no pisa la iteración 2):
    python ml/entrenar_cu1.py --datos ml/datos_it3 --salida-base ml/modelos_it3
    python ml/entrenar_cu2_beto.py --datos ml/datos_it3 --salida ml/modelos_it3/cu2-beto-v1
    python ml/entrenar_cu2_tfidf.py --datos ml/datos_it3 --salida ml/modelos_it3/cu2-tfidf-logreg-v1
    python ml/evaluar_fusion.py --datos ml/datos_it3 --modelos ml/modelos_it3
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import pandas as pd
from PIL import Image

CARPETA_ML = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_ML))
from comun import CLASES, LABEL2ID  # noqa: E402

DATOS = CARPETA_ML / "datos"
COLUMNAS = ["id", "fuente", "titulo", "descripcion", "texto_es", "ruta_imagen", "indice_clase", "categoria"]


def normalizar(texto: str) -> str:
    return " ".join(str(texto).lower().split())


def huella(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def con_rutas_locales(df: pd.DataFrame) -> pd.DataFrame:
    """Las rutas guardadas apuntan a la PC donde se armó el dataset; acá
    las fotos están en ml/datos/imagenes/<id>.jpg."""
    df = df.copy()
    df["ruta_imagen"] = [str(DATOS / "imagenes" / f"{i}.jpg") for i in df["id"]]
    faltan = [r for r in df["ruta_imagen"] if not Path(r).exists()]
    if faltan:
        raise SystemExit(f"Faltan {len(faltan)} fotos, por ejemplo {faltan[0]}")
    return df


def leer_propios(ruta_csv: Path, carpeta_fotos: Path, prohibidos_texto: set[str], prohibidos_foto: set[str]) -> tuple[pd.DataFrame, list[str]]:
    propios = pd.read_csv(ruta_csv, dtype=str).fillna("")
    avisos, filas = [], []
    for numero, fila in enumerate(propios.itertuples(index=False), start=2):
        donde = f"{ruta_csv.name} fila {numero}"
        categoria = fila.categoria.strip()
        if categoria not in LABEL2ID:
            avisos.append(f"{donde}: categoría desconocida «{categoria}» (usa una de las 21 exactas)")
            continue
        foto = (ruta_csv.parent / fila.foto.strip()).resolve()
        if not foto.is_file():
            avisos.append(f"{donde}: no existe la foto {fila.foto}")
            continue
        try:
            with Image.open(foto) as imagen:
                imagen.convert("RGB").load()
        except Exception:
            avisos.append(f"{donde}: la foto {fila.foto} no se puede abrir")
            continue
        titulo, descripcion = fila.titulo.strip(), fila.descripcion.strip()
        if len(titulo) < 2:
            avisos.append(f"{donde}: falta el título")
            continue
        if normalizar(titulo) in prohibidos_texto or huella(foto) in prohibidos_foto:
            avisos.append(f"{donde}: igual a un producto de validación o prueba, se descarta")
            continue
        destino = carpeta_fotos / f"propio_{numero:05d}{foto.suffix.lower() or '.jpg'}"
        shutil.copyfile(foto, destino)
        filas.append(
            {
                "id": f"propio_{numero:05d}",
                "fuente": "novastore",
                "titulo": titulo,
                "descripcion": descripcion,
                # Ya está en español: no se traduce.
                "texto_es": f"{titulo}. {descripcion}" if descripcion else titulo,
                "ruta_imagen": str(destino),
                "indice_clase": LABEL2ID[categoria],
                "categoria": categoria,
            }
        )
    return pd.DataFrame(filas, columns=COLUMNAS), avisos


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--propios", type=Path, default=None, help="CSV con datos propios (ver ml/plantilla_datos_propios.csv)")
    parser.add_argument("--minimo", type=int, default=150, help="Ejemplos de entrenamiento mínimos por categoría")
    parser.add_argument("--salida", type=Path, default=CARPETA_ML / "datos_it3")
    args = parser.parse_args()

    train, val, test = (con_rutas_locales(pd.read_csv(DATOS / f"{p}.csv", dtype={"id": str})) for p in ("train", "val", "test"))

    if args.salida.exists():
        shutil.rmtree(args.salida)
    (args.salida / "imagenes_propias").mkdir(parents=True)

    avisos: list[str] = []
    propios = pd.DataFrame(columns=COLUMNAS)
    if args.propios:
        evaluacion = pd.concat([val, test])
        prohibidos_texto = {normalizar(t) for t in evaluacion["titulo"]} | {normalizar(t) for t in evaluacion["texto_es"]}
        prohibidos_foto = {huella(Path(r)) for r in evaluacion["ruta_imagen"]}
        propios, avisos = leer_propios(args.propios, args.salida / "imagenes_propias", prohibidos_texto, prohibidos_foto)
        for aviso in avisos:
            print("  [!]", aviso)

    base = pd.concat([train, propios], ignore_index=True)
    reales = base["categoria"].value_counts()
    partes = [base]
    for categoria in CLASES:
        de_la_clase = base[base["categoria"] == categoria]
        faltan = args.minimo - len(de_la_clase)
        if faltan > 0 and len(de_la_clase) > 0:
            copias = de_la_clase.sample(n=faltan, replace=True, random_state=42)
            partes.append(copias)
    train_it3 = pd.concat(partes, ignore_index=True).sample(frac=1, random_state=42)

    for nombre, df in (("train", train_it3), ("val", val), ("test", test)):
        df[COLUMNAS].to_csv(args.salida / f"{nombre}.csv", index=False)

    reporte = {
        "minimo_por_clase": args.minimo,
        "datos_propios_aceptados": int(len(propios)),
        "datos_propios_descartados": len(avisos),
        "val_igual_a_iteracion_2": int(len(val)),
        "test_igual_a_iteracion_2": int(len(test)),
        "por_clase": {
            c: {"reales": int(reales.get(c, 0)), "propios": int((propios["categoria"] == c).sum()),
                "con_repeticiones": int((train_it3["categoria"] == c).sum())}
            for c in CLASES
        },
    }
    (args.salida / "reporte_it3.json").write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")
    chicas = {c: v for c, v in reporte["por_clase"].items() if v["reales"] < args.minimo}
    print(f"Entrenamiento: {len(train)} -> {len(train_it3)} filas ({len(propios)} propias). Validación y prueba sin cambios.")
    for c, v in chicas.items():
        print(f"  {c}: {v['reales']} reales ({v['propios']} propias) -> {v['con_repeticiones']}")
    print(f"Listo en {args.salida}")


if __name__ == "__main__":
    main()
