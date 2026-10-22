"""Convierte la salida de cada modelo a una distribución sobre las 21
categorías EN EL ORDEN DE LA TAXONOMÍA (indice_clase de la base).

Cada artefacto trae sus clases en el orden en que se entrenó: el
checkpoint de imagen en "clases", BETO en config.id2label, y el pipeline
de sklearn en classes_ (que sklearn ordena alfabéticamente). Ese orden NO
tiene por qué coincidir con indice_clase — por eso se mapea siempre por
NOMBRE, nunca por posición."""

from __future__ import annotations

from app.config import CATEGORIAS
from app.esquemas import TopK

_INDICE = {categoria: i for i, categoria in enumerate(CATEGORIAS)}


class ClasesNoCoincidenError(ValueError):
    pass


def validar_clases(clases: list[str], origen: str) -> None:
    desconocidas = [c for c in clases if c not in _INDICE]
    if desconocidas:
        raise ClasesNoCoincidenError(
            f"{origen} tiene clases que no están en la taxonomía de app/config.py: {desconocidas}. "
            "¿Se entrenó con otra versión de las categorías?"
        )


def a_taxonomia(probabilidades: list[float], clases: list[str]) -> list[float]:
    vector = [0.0] * len(CATEGORIAS)
    for probabilidad, clase in zip(probabilidades, clases):
        vector[_INDICE[clase]] = float(probabilidad)
    return vector


def resumir(vector: list[float], k: int = 5) -> tuple[int, str, float, list[TopK]]:
    orden = sorted(range(len(vector)), key=lambda i: vector[i], reverse=True)
    indice = orden[0]
    top_k = [TopK(indice_clase=i, categoria=CATEGORIAS[i], prob=vector[i]) for i in orden[:k]]
    return indice, CATEGORIAS[indice], vector[indice], top_k
