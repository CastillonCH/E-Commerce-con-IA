"""CU1 — Clasificación automática de productos por imagen.

Transfer learning con ResNet-50 preentrenada en ImageNet, con la capa
final reemplazada para las 21 categorías de NovaStore (ver Tabla 2 del
T1 y app/config.py). El entrenamiento (transfer learning real, con los
pesos de ImageNet) vive en scripts/train_cu1_image.py — aquí solo se
carga el checkpoint ya entrenado y se corre inferencia, por lo que no
necesita salir a internet en producción.
"""

from functools import lru_cache
from io import BytesIO

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

from app.config import CATEGORIAS, settings

_TRANSFORM = transforms.Compose(
    [
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


def construir_modelo(num_clases: int = len(CATEGORIAS)) -> nn.Module:
    # weights=None: la arquitectura se arma vacía, los pesos reales vienen
    # del checkpoint fine-tuneado (state_dict), no de una descarga en vivo.
    modelo = models.resnet50(weights=None)
    modelo.fc = nn.Linear(modelo.fc.in_features, num_clases)
    return modelo


class ModeloNoEntrenadoError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _cargar_checkpoint() -> tuple[nn.Module, list[str]]:
    if not settings.cu1_weights_path.exists():
        raise ModeloNoEntrenadoError(
            f"No se encontró el checkpoint de CU1 en {settings.cu1_weights_path}. "
            "Corre scripts/train_cu1_image.py primero."
        )
    estado = torch.load(settings.cu1_weights_path, map_location="cpu")
    # El checkpoint guarda su propio orden de clases (scripts/train_cu1_image.py
    # usa ImageFolder, que ordena alfabéticamente — NO necesariamente el orden
    # de CATEGORIAS en config.py). Confiar en CATEGORIAS aquí sería un bug
    # clásico de índices desalineados.
    clases: list[str] = estado["clases"]
    modelo = construir_modelo(num_clases=len(clases))
    modelo.load_state_dict(estado["modelo"])
    modelo.eval()
    return modelo, clases


def clasificar_imagen(imagen_bytes: bytes) -> tuple[str, float]:
    """Devuelve (categoría predicha, confianza softmax de esa clase)."""
    modelo, clases = _cargar_checkpoint()
    imagen = Image.open(BytesIO(imagen_bytes)).convert("RGB")
    entrada = _TRANSFORM(imagen).unsqueeze(0)

    with torch.no_grad():
        logits = modelo(entrada)
        probabilidades = torch.softmax(logits, dim=1).squeeze(0)

    indice = int(torch.argmax(probabilidades).item())
    return clases[indice], float(probabilidades[indice].item())


def extraer_embedding(imagen_bytes: bytes) -> list[float]:
    """Embedding de 2048 dims (salida de avgpool, antes de la capa fc) —
    insumo de CU5 (detección de duplicados) vía similitud coseno."""
    modelo, _ = _cargar_checkpoint()
    imagen = Image.open(BytesIO(imagen_bytes)).convert("RGB")
    entrada = _TRANSFORM(imagen).unsqueeze(0)

    extractor = nn.Sequential(*list(modelo.children())[:-1])  # todo menos fc
    with torch.no_grad():
        salida = extractor(entrada).flatten(1).squeeze(0)
    return salida.tolist()
