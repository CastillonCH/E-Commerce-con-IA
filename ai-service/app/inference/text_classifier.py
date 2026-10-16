"""CU2 — Clasificación automática de productos por texto.

Transfer learning con BETO (dccuchile/bert-base-spanish-wwm-cased)
ajustado a las 21 categorías. Igual que CU1: el fine-tuning vive en
scripts/train_cu2_text.py; aquí solo se carga el checkpoint guardado por
`transformers` (carpeta local, no un modelo remoto) y se corre inferencia.
"""

from functools import lru_cache

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from app.config import settings


class ModeloNoEntrenadoError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _cargar_modelo():
    if not settings.cu2_weights_dir.exists():
        raise ModeloNoEntrenadoError(
            f"No se encontró el checkpoint de CU2 en {settings.cu2_weights_dir}. "
            "Corre scripts/train_cu2_text.py primero."
        )
    tokenizer = AutoTokenizer.from_pretrained(settings.cu2_weights_dir)
    modelo = AutoModelForSequenceClassification.from_pretrained(settings.cu2_weights_dir)
    modelo.eval()
    return tokenizer, modelo


def clasificar_texto(nombre: str, descripcion: str = "") -> tuple[str, float]:
    tokenizer, modelo = _cargar_modelo()
    texto = f"{nombre}. {descripcion}".strip()
    entrada = tokenizer(
        texto, return_tensors="pt", truncation=True, max_length=128, padding=True
    )

    with torch.no_grad():
        logits = modelo(**entrada).logits
        probabilidades = torch.softmax(logits, dim=1).squeeze(0)

    indice = int(torch.argmax(probabilidades).item())
    # id2label viene del config.json que guarda save_pretrained() en el
    # entrenamiento (scripts/train_cu2_text.py) — no asumir el orden de
    # config.py: sería el mismo bug de índices desalineados que en CU1.
    return modelo.config.id2label[indice], float(probabilidades[indice].item())


def extraer_embedding(nombre: str, descripcion: str = "") -> list[float]:
    """Embedding de 768 dims (salida [CLS] de BETO) — insumo de CU5."""
    tokenizer, modelo = _cargar_modelo()
    texto = f"{nombre}. {descripcion}".strip()
    entrada = tokenizer(
        texto, return_tensors="pt", truncation=True, max_length=128, padding=True
    )

    with torch.no_grad():
        salida = modelo.base_model(**entrada)
        embedding_cls = salida.last_hidden_state[:, 0, :].squeeze(0)
    return embedding_cls.tolist()
