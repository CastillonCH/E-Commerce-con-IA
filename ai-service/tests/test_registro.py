"""Prueba de carga de modelos con artefactos diminutos generados en el
momento — no necesita ningún modelo entrenado de verdad ni descargar
nada. Valida que app/modelos/registro.py encuentra y carga lo que haya
en MODELS_DIR con la estructura real (ver README.md)."""

import json
from pathlib import Path

import joblib
import torch
from fastapi.testclient import TestClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.config import CATEGORIAS
from app.main import crear_app
from app.modelos.cargador_imagen import _construir_arquitectura
from app.modelos.registro import cargar_registro


def _guardar_checkpoint_imagen_diminuto(carpeta: Path) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    modelo = _construir_arquitectura("resnet50", num_clases=len(CATEGORIAS))
    torch.save({"modelo": modelo.state_dict(), "clases": CATEGORIAS}, carpeta / "modelo.pt")
    (carpeta / "metricas.json").write_text(json.dumps({"accuracy": 0.42, "f1_macro": 0.37}), encoding="utf-8")


def _guardar_pipeline_tfidf_diminuto(carpeta: Path) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    pipeline = Pipeline([("tfidf", TfidfVectorizer()), ("clf", LogisticRegression())])
    pipeline.fit(["producto de prueba uno", "producto de prueba dos"], [CATEGORIAS[0], CATEGORIAS[1]])
    joblib.dump(pipeline, carpeta / "pipeline.joblib")
    (carpeta / "metricas.json").write_text(json.dumps({"accuracy": 0.5, "f1_macro": 0.4}), encoding="utf-8")


def test_cargar_registro_encuentra_y_carga_artefactos_reales(tmp_path: Path):
    models_dir = tmp_path / "models"
    _guardar_checkpoint_imagen_diminuto(models_dir / "cu1-resnet50-v1")
    _guardar_pipeline_tfidf_diminuto(models_dir / "cu2-tfidf-logreg-v1")

    registro = cargar_registro(models_dir)

    assert registro.modo == "real"
    assert "cu1-resnet50-v1" in registro.codigos_cargados
    assert "cu2-tfidf-logreg-v1" in registro.codigos_cargados
    assert registro.metricas["cu1-resnet50-v1"]["accuracy"] == 0.42


def test_cargar_registro_valida_labels_json_y_no_falla_si_no_coincide(tmp_path: Path, caplog):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    (models_dir / "labels.json").write_text(json.dumps({"0": "Categoría Inventada"}), encoding="utf-8")

    registro = cargar_registro(models_dir)  # no debe lanzar excepción

    assert registro.modo == "demo"  # sin artefactos de modelo, sigue en demo igual


def test_app_con_modelo_real_cargado_responde_modo_real_end_to_end(tmp_path: Path):
    models_dir = tmp_path / "models"
    _guardar_checkpoint_imagen_diminuto(models_dir / "cu1-resnet50-v1")
    _guardar_pipeline_tfidf_diminuto(models_dir / "cu2-tfidf-logreg-v1")

    app = crear_app(models_dir=models_dir)
    cliente = TestClient(app)

    salud = cliente.get("/health").json()
    assert salud["modo"] == "real"
    assert set(salud["modelos_cargados"]) == {"cu1-resnet50-v1", "cu2-tfidf-logreg-v1"}

    modelos = cliente.get("/modelos").json()
    por_codigo = {m["codigo"]: m for m in modelos}
    assert por_codigo["cu1-resnet50-v1"]["cargado"] is True
    assert por_codigo["cu1-efficientnet-b0-v1"]["cargado"] is False
    assert por_codigo["cu2-tfidf-logreg-v1"]["cargado"] is True
    assert por_codigo["cu2-beto-v1"]["cargado"] is False
