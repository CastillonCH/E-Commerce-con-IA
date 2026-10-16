"""Dataset sintético diminuto para poder ejecutar los notebooks 01/02/03
en MODO_RAPIDO sin depender de que 00_preparar_dataset.ipynb ya haya
corrido (p. ej. al verificarlos localmente, sin Drive). Si ya existen
train.csv/val.csv/test.csv en la carpeta de datos, no hace nada.

NO usar esto para entrenar de verdad — es solo plomería de prueba: texto
genérico por categoría e imágenes de un solo color, sin señal real.
"""

from pathlib import Path

import pandas as pd
from PIL import Image

from mapeo_categorias import CATEGORIAS, INDICE_CLASE


def generar_si_falta(carpeta_datos: Path, por_clase: int = 5) -> None:
    carpeta_datos = Path(carpeta_datos)
    if (carpeta_datos / "train.csv").exists():
        return

    carpeta_imagenes = carpeta_datos / "imagenes"
    carpeta_imagenes.mkdir(parents=True, exist_ok=True)

    filas = []
    id_siguiente = 0
    for categoria in CATEGORIAS:
        for i in range(por_clase):
            color = ((id_siguiente * 37) % 256, (id_siguiente * 59) % 256, (id_siguiente * 83) % 256)
            ruta = carpeta_imagenes / f"{id_siguiente}.jpg"
            Image.new("RGB", (64, 64), color=color).save(ruta, "JPEG")
            filas.append(
                {
                    "id": id_siguiente,
                    "titulo": f"{categoria} producto de prueba {i}",
                    "descripcion": f"Descripción de prueba para {categoria}.",
                    "texto_es": f"{categoria} producto de prueba {i}. Descripción de prueba para {categoria}.",
                    "ruta_imagen": str(ruta),
                    "indice_clase": INDICE_CLASE[categoria],
                    "categoria": categoria,
                }
            )
            id_siguiente += 1

    df = pd.DataFrame(filas)
    # Split simple (no estratificado con sklearn porque con 5/clase alcanza
    # para una demo de MODO_RAPIDO, no para métricas reales).
    train = df.groupby("categoria", group_keys=False).apply(lambda g: g.iloc[: max(1, por_clase - 2)])
    resto = df.drop(train.index)
    val = resto.groupby("categoria", group_keys=False).apply(lambda g: g.iloc[:1])
    test = resto.drop(val.index)

    carpeta_datos.mkdir(parents=True, exist_ok=True)
    train.to_csv(carpeta_datos / "train.csv", index=False)
    val.to_csv(carpeta_datos / "val.csv", index=False)
    test.to_csv(carpeta_datos / "test.csv", index=False)
    print(f"[MODO_RAPIDO] dataset sintético generado en {carpeta_datos} ({len(train)} train / {len(val)} val / {len(test)} test).")
