"""Esquemas de request/response — el contrato con lib/ai-client.ts."""

from pydantic import BaseModel


class TopK(BaseModel):
    indice_clase: int
    categoria: str
    prob: float


class ResultadoClasificacion(BaseModel):
    indice_clase: int
    categoria: str
    confianza: float
    top_k: list[TopK]


class PorModelo(BaseModel):
    codigo_modelo: str
    tipo: str  # "imagen" | "texto"
    indice_clase: int
    categoria: str
    confianza: float
    top_k: list[TopK]


class EmbeddingSalida(BaseModel):
    codigo_modelo: str
    fuente: str  # "imagen" | "texto"
    vector: list[float]


class ClasificarResponse(BaseModel):
    modo: str  # "real" | "demo"
    latencia_ms: int
    resultado: ResultadoClasificacion
    por_modelo: list[PorModelo]
    embeddings: list[EmbeddingSalida]


class ModeloInfo(BaseModel):
    codigo: str
    arquitectura: str
    tipo: str
    metricas: dict
    cargado: bool


class HealthResponse(BaseModel):
    estado: str
    modo: str  # "real" | "demo"
    modelos_cargados: list[str]
