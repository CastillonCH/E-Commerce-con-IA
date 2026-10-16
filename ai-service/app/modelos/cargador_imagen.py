"""CU1 — carga un checkpoint de ResNet-50/EfficientNet-B0 ya entrenado
(ml/notebooks/03_cu1_imagen.ipynb) y corre inferencia/embeddings. No
descarga nada de internet: la arquitectura se arma vacía (weights=None)
y los pesos reales vienen del checkpoint local — por eso este servicio
puede correr sin salida a internet en producción."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

from app.esquemas import TopK

_TRANSFORM = transforms.Compose(
    [
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


@dataclass
class ModeloImagen:
    codigo: str
    arquitectura: str
    modelo: nn.Module
    clases: list[str]
    extractor_embedding: nn.Module


def _construir_arquitectura(arquitectura: str, num_clases: int) -> nn.Module:
    if arquitectura == "resnet50":
        modelo = models.resnet50(weights=None)
        modelo.fc = nn.Linear(modelo.fc.in_features, num_clases)
        return modelo
    if arquitectura == "efficientnet_b0":
        modelo = models.efficientnet_b0(weights=None)
        modelo.classifier[1] = nn.Linear(modelo.classifier[1].in_features, num_clases)
        return modelo
    raise ValueError(f"Arquitectura de imagen no soportada: {arquitectura}")


def cargar(ruta_checkpoint, codigo: str, arquitectura: str) -> ModeloImagen:
    # weights_only=True: el checkpoint es {"modelo": state_dict, "clases":
    # list[str]} nada más — no hace falta deserializar pickle arbitrario,
    # y es la recomendación actual de seguridad de PyTorch para torch.load.
    estado = torch.load(ruta_checkpoint, map_location="cpu", weights_only=True)
    clases: list[str] = estado["clases"]
    modelo = _construir_arquitectura(arquitectura, len(clases))
    modelo.load_state_dict(estado["modelo"])
    modelo.eval()
    extractor = nn.Sequential(*list(modelo.children())[:-1])
    return ModeloImagen(codigo=codigo, arquitectura=arquitectura, modelo=modelo, clases=clases, extractor_embedding=extractor)


def _decodificar(imagen_bytes: bytes) -> Image.Image:
    return Image.open(BytesIO(imagen_bytes)).convert("RGB")


def clasificar(modelo_imagen: ModeloImagen, imagen_bytes: bytes, k: int = 5) -> tuple[int, str, float, list[TopK]]:
    entrada = _TRANSFORM(_decodificar(imagen_bytes)).unsqueeze(0)
    with torch.no_grad():
        logits = modelo_imagen.modelo(entrada)
        probabilidades = torch.softmax(logits, dim=1).squeeze(0)

    indice = int(torch.argmax(probabilidades).item())
    categoria = modelo_imagen.clases[indice]
    confianza = float(probabilidades[indice].item())

    top_valores, top_indices = torch.topk(probabilidades, k=min(k, len(modelo_imagen.clases)))
    top_k = [
        TopK(indice_clase=int(i), categoria=modelo_imagen.clases[int(i)], prob=float(v))
        for v, i in zip(top_valores.tolist(), top_indices.tolist())
    ]
    return indice, categoria, confianza, top_k


def embedding(modelo_imagen: ModeloImagen, imagen_bytes: bytes) -> list[float]:
    entrada = _TRANSFORM(_decodificar(imagen_bytes)).unsqueeze(0)
    with torch.no_grad():
        salida = modelo_imagen.extractor_embedding(entrada)
    return salida.flatten(1).squeeze(0).tolist()
