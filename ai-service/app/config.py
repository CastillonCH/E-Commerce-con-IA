"""Configuración del servicio y taxonomía.

La taxonomía está duplicada a propósito (no es una dependencia compartida
con el frontend porque son dos proyectos/lenguajes distintos), pero debe
coincidir EXACTAMENTE con lib/taxonomy.ts y con la Tabla 2 del T1 — son
las 21 clases que predicen los modelos de CU1/CU2.
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

# Las 21 categorías en un orden fijo: es el mismo orden que usan las capas
# de salida de los clasificadores (índice de la lista == índice de la clase).
CATEGORIAS: list[str] = [
    categoria
    for departamento in DEPARTAMENTOS
    for categoria in CATEGORIAS_POR_DEPARTAMENTO[departamento]
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Dónde viven los pesos entrenados (ver scripts/train_cu1_image.py y
    # train_cu2_text.py). Si el archivo no existe, el servicio arranca igual
    # pero /api/productos devuelve 503 — nunca inventa una predicción.
    cu1_weights_path: Path = Path("models/cu1_resnet50.pt")
    cu2_weights_dir: Path = Path("models/cu2_beto")

    # Peso de cada modalidad al combinar CU1 (imagen) y CU2 (texto) en una
    # sola predicción — ver app/inference/ensemble.py. 0.6/0.4 refleja que
    # CU1 quedó primero en la matriz RICE (Tabla 7 del T1).
    peso_imagen: float = 0.6
    peso_texto: float = 0.4

    # Almacenamiento de las fotos subidas. Si no hay cadena de conexión de
    # Azure, cae a disco local servido por este mismo FastAPI (solo para
    # desarrollo) — next.config.ts ya espera AZURE_BLOB_HOSTNAME para CSP e
    # <Image>, así que en producción esto debe apuntar a Azure Blob Storage.
    azure_storage_connection_string: str | None = None
    azure_storage_container: str = "productos"
    local_media_dir: Path = Path("media")
    public_base_url: str = "http://localhost:8000"

    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
