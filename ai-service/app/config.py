"""Configuración del servicio y taxonomía — debe coincidir EXACTAMENTE
con lib/taxonomy.ts del frontend y con categorias.indice_clase de
db/novastore_postgresql.sql. Está duplicada a propósito (son ecosistemas
de lenguajes distintos), igual que en ml/mapeo_categorias.py.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEPARTAMENTOS: list[str] = [
    "Electrónica",
    "Hogar",
    "Moda",
    "Deportes",
    "Belleza",
    "Juguetes",
    "Supermercado",
]

CATEGORIAS_POR_DEPARTAMENTO: dict[str, list[str]] = {
    "Electrónica": [
        "Audio y audífonos",
        "Laptops y computadoras",
        "Relojes inteligentes y wearables",
    ],
    "Hogar": ["Electrodomésticos de cocina", "Muebles", "Decoración y menaje"],
    "Moda": ["Casacas y abrigos", "Zapatillas y calzado", "Polos y camisas"],
    "Deportes": ["Balones", "Ropa deportiva", "Equipos de fitness"],
    "Belleza": ["Fragancias", "Maquillaje", "Herramientas de belleza"],
    "Juguetes": ["Bloques de construcción", "Peluches", "Vehículos de juguete"],
    "Supermercado": ["Bebidas", "Abarrotes y snacks", "Limpieza del hogar"],
}

# Las 21 categorías en el orden fijo = indice_clase (0..20).
CATEGORIAS: list[str] = [
    categoria
    for departamento in DEPARTAMENTOS
    for categoria in CATEGORIAS_POR_DEPARTAMENTO[departamento]
]

# Códigos de modelos_ia.codigo que este servicio sabe cargar — deben
# coincidir letra por letra con los sembrados en db/novastore_postgresql.sql.
CODIGO_CU1_RESNET50 = "cu1-resnet50-v1"
CODIGO_CU1_EFFICIENTNET = "cu1-efficientnet-b0-v1"
CODIGO_CU2_BETO = "cu2-beto-v1"
CODIGO_CU2_TFIDF = "cu2-tfidf-logreg-v1"

DIMENSION_EMBEDDING = {
    CODIGO_CU1_RESNET50: 2048,
    CODIGO_CU1_EFFICIENTNET: 1280,
    CODIGO_CU2_BETO: 768,
}

TAMANO_MAXIMO_IMAGEN_BYTES = 5 * 1024 * 1024  # 5 MB
TIPOS_IMAGEN_PERMITIDOS = {"image/png", "image/jpeg", "image/webp"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    models_dir: Path = Path("./models")
    # Secreto compartido con Next (header X-API-Key). Si queda vacío, el
    # servicio NO exige autenticación — útil solo para correr en local;
    # en cualquier despliegue real debe estar seteado.
    ai_api_key: str | None = None
    peso_fusion_imagen: float = 0.6
    port: int = 8000


settings = Settings()
