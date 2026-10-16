"""Combina CU1 (imagen) y CU2 (texto) en una sola predicción.

El frontend (lib/api.ts) solo espera UN par (predicted_category, accuracy)
por producto nuevo — ver types/index.ts::AIResponse. Internamente corremos
los dos modelos (como hace la literatura citada en el T1: Seo et al. 2025
combinan imagen+texto con mejor resultado que cualquiera de los dos por
separado) y promediamos sus probabilidades por clase, ponderado según
settings.peso_imagen/peso_texto.

Si uno de los dos modelos todavía no está entrenado, se usa solo el que
sí esté disponible — nunca se inventa una predicción. Si ninguno está
entrenado, ModeloNoEntrenadoError se propaga y el endpoint responde 503.
"""

import torch

from app.config import CATEGORIAS, settings
from app.inference import image_classifier, text_classifier


def _distribucion_completa(categoria: str, confianza: float) -> torch.Tensor:
    """Convierte (categoría, confianza de esa clase) en un vector de 21
    probabilidades — el resto de la masa se reparte uniformemente entre
    las clases restantes, suficiente para promediar con la otra modalidad."""
    vector = torch.full((len(CATEGORIAS),), (1 - confianza) / (len(CATEGORIAS) - 1))
    vector[CATEGORIAS.index(categoria)] = confianza
    return vector


def predecir(
    imagen_bytes: bytes, nombre: str, descripcion: str = ""
) -> tuple[str, float]:
    distribuciones: list[tuple[torch.Tensor, float]] = []

    try:
        cat_img, conf_img = image_classifier.clasificar_imagen(imagen_bytes)
        distribuciones.append((_distribucion_completa(cat_img, conf_img), settings.peso_imagen))
    except image_classifier.ModeloNoEntrenadoError:
        pass

    try:
        cat_txt, conf_txt = text_classifier.clasificar_texto(nombre, descripcion)
        distribuciones.append((_distribucion_completa(cat_txt, conf_txt), settings.peso_texto))
    except text_classifier.ModeloNoEntrenadoError:
        pass

    if not distribuciones:
        raise image_classifier.ModeloNoEntrenadoError(
            "Ni CU1 (imagen) ni CU2 (texto) tienen un checkpoint entrenado todavía."
        )

    peso_total = sum(peso for _, peso in distribuciones)
    combinada = sum(dist * (peso / peso_total) for dist, peso in distribuciones)

    indice = int(torch.argmax(combinada).item())
    return CATEGORIAS[indice], float(combinada[indice].item())
