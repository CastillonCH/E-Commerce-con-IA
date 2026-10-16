from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.main import crear_app


@pytest.fixture
def carpeta_models_vacia(tmp_path: Path) -> Path:
    """Garantiza modo demo sin importar si localmente ya copiaste modelos
    reales a ai-service/models/ — los tests nunca deben depender de eso."""
    carpeta = tmp_path / "models"
    carpeta.mkdir()
    return carpeta


@pytest.fixture
def cliente_demo(carpeta_models_vacia: Path) -> TestClient:
    app = crear_app(models_dir=carpeta_models_vacia)
    return TestClient(app)


@pytest.fixture
def imagen_de_prueba_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (64, 64), color=(120, 60, 200)).save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def con_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ai_api_key", "clave-de-prueba")
    yield "clave-de-prueba"
