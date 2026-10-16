"""Modelos de respuesta — deben coincidir exactamente con types/index.ts
(Product, AIResponse, CreateProductResponse) del frontend: es el único
contrato entre los dos proyectos.
"""

from pydantic import BaseModel


class Producto(BaseModel):
    id: str
    nombre: str
    precio: float
    stock: int
    marca: str
    departamento: str
    imagen_url: str
    categoria_ia: str


class AIResponse(BaseModel):
    success: bool
    predicted_category: str
    accuracy: float


class CreateProductResponse(BaseModel):
    producto: Producto
    ai: AIResponse


class ErrorResponse(BaseModel):
    detail: str
