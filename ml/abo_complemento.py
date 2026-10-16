"""Complemento OPCIONAL de datos desde Amazon Berkeley Objects (ABO),
licencia CC BY 4.0 — https://amazon-berkeley-objects.s3.amazonaws.com

Solo se usa si preparar_dataset.py corre con --complementar-abo, para
sumar ejemplos a categorías que quedaron con menos de 100 productos desde
Shopify/product-catalogue. NO se descargó ni se corrió de punta a punta
en este sandbox (los archivos de ABO pesan varios GB: abo-listings.tar
~470 MB comprimido, abo-images-small.tar ~3 GB) — la lógica sigue el
formato público y documentado de ABO (un listing por línea JSON dentro de
listings/metadata/listings_<n>.json.gz, con `product_type`, `item_name`
por idioma, e `main_image_id` que se resuelve contra
images/metadata/images.csv.gz). Revísalo con cuidado la primera vez que
lo actives — ver docs/GUIA_COLAB.md.
"""

from __future__ import annotations

import gzip
import json
import tarfile
import urllib.request
from pathlib import Path

ABO_BASE_URL = "https://amazon-berkeley-objects.s3.amazonaws.com"
CARPETA_CACHE = Path("ml/datos/abo_cache")


def _descargar_si_falta(nombre_archivo: str) -> Path:
    destino = CARPETA_CACHE / nombre_archivo
    if destino.exists():
        return destino
    CARPETA_CACHE.mkdir(parents=True, exist_ok=True)
    url = f"{ABO_BASE_URL}/archives/{nombre_archivo}"
    print(f"Descargando {url} ...")
    urllib.request.urlretrieve(url, destino)
    return destino


def _mapa_imagenes() -> dict[str, str]:
    """image_id -> ruta relativa dentro de images/small/."""
    tar_path = _descargar_si_falta("abo-images-small.tar")
    mapa: dict[str, str] = {}
    with tarfile.open(tar_path) as tar:
        miembro = tar.extractfile("images/metadata/images.csv.gz")
        if miembro is None:
            raise FileNotFoundError("images/metadata/images.csv.gz no está en el tar de ABO.")
        with gzip.open(miembro, "rt", encoding="utf-8") as f:
            next(f)  # cabecera: image_id,height,width,path
            for linea in f:
                partes = linea.strip().split(",")
                if len(partes) >= 4:
                    mapa[partes[0]] = partes[3]
    return mapa, tar_path


def cargar_candidatos_abo(
    categoria_novastore: str,
    product_type_a_categoria: dict[str, str | None],
    limite: int = 200,
) -> list[dict]:
    """Devuelve hasta `limite` candidatos {"titulo", "descripcion", "imagen"}
    de ABO cuyo `product_type` mapea a `categoria_novastore`."""
    tipos_relevantes = {
        tipo for tipo, cat in product_type_a_categoria.items() if cat == categoria_novastore
    }
    if not tipos_relevantes:
        return []

    mapa_imagenes, tar_imagenes = _mapa_imagenes()
    listings_tar = _descargar_si_falta("abo-listings.tar")

    candidatos: list[dict] = []
    with tarfile.open(listings_tar) as tar:
        nombres = [n for n in tar.getnames() if n.startswith("listings/metadata/listings_") and n.endswith(".json.gz")]
        for nombre in nombres:
            if len(candidatos) >= limite:
                break
            miembro = tar.extractfile(nombre)
            if miembro is None:
                continue
            with gzip.open(miembro, "rt", encoding="utf-8") as f:
                for linea in f:
                    if len(candidatos) >= limite:
                        break
                    registro = json.loads(linea)
                    if registro.get("product_type", [{}])[0].get("value") not in tipos_relevantes:
                        continue
                    nombres_es = [
                        n["value"] for n in registro.get("item_name", []) if n.get("language_tag", "").startswith("es")
                    ]
                    nombres_en = [
                        n["value"] for n in registro.get("item_name", []) if n.get("language_tag", "").startswith("en")
                    ]
                    titulo = (nombres_es or nombres_en or [None])[0]
                    image_id = registro.get("main_image_id")
                    if not titulo or not image_id or image_id not in mapa_imagenes:
                        continue

                    with tarfile.open(tar_imagenes) as tar_img:
                        img_miembro = tar_img.extractfile(f"images/small/{mapa_imagenes[image_id]}")
                        if img_miembro is None:
                            continue
                        imagen_bytes = img_miembro.read()

                    candidatos.append(
                        {
                            "titulo": titulo,
                            "descripcion": "",
                            "imagen": {"bytes": imagen_bytes},
                        }
                    )
    return candidatos
