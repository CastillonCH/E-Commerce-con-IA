"""Carga, al iniciar el servicio, lo que encuentre en MODELS_DIR.

Estructura esperada (ver README.md — es la misma que arma GUIA_COLAB.md
al explicar cómo copiar lo que entrenaron los notebooks):

    models/
      labels.json                        (opcional — se valida contra CATEGORIAS)
      cu1-resnet50-v1/
        modelo.pt
        metricas.json
      cu1-efficientnet-b0-v1/
        modelo.pt
        metricas.json
      cu2-beto-v1/
        config.json, model.safetensors, tokenizer...  (carpeta de save_pretrained)
        metricas.json
      cu2-tfidf-logreg-v1/
        pipeline.joblib
        metricas.json

Si NINGUNA de las 4 carpetas tiene su artefacto, el servicio arranca
igual en modo "demo" — nunca falla al iniciar por falta de modelos."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.config import CATEGORIAS, settings
from app.modelos import cargador_imagen, cargador_texto

logger = logging.getLogger("novastore_ia")

ARQUITECTURA_POR_CODIGO = {
    "cu1-resnet50-v1": "resnet50",
    "cu1-efficientnet-b0-v1": "efficientnet_b0",
}


@dataclass
class Registro:
    modelos_imagen: dict[str, cargador_imagen.ModeloImagen] = field(default_factory=dict)
    modelo_beto: cargador_texto.ModeloTextoBeto | None = None
    modelo_tfidf: cargador_texto.ModeloTextoTfidf | None = None
    metricas: dict[str, dict] = field(default_factory=dict)
    arquitecturas: dict[str, str] = field(default_factory=dict)

    @property
    def modo(self) -> str:
        return "real" if (self.modelos_imagen or self.modelo_beto or self.modelo_tfidf) else "demo"

    @property
    def codigos_cargados(self) -> list[str]:
        codigos = list(self.modelos_imagen.keys())
        if self.modelo_beto:
            codigos.append(self.modelo_beto.codigo)
        if self.modelo_tfidf:
            codigos.append(self.modelo_tfidf.codigo)
        return codigos


def _leer_metricas(carpeta: Path) -> dict:
    ruta = carpeta / "metricas.json"
    if not ruta.exists():
        return {}
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("No se pudo leer %s", ruta)
        return {}


def _validar_labels(models_dir: Path) -> None:
    ruta = models_dir / "labels.json"
    if not ruta.exists():
        return
    try:
        labels = json.loads(ruta.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("labels.json en %s no es JSON válido — se ignora.", models_dir)
        return
    esperado = {str(i): categoria for i, categoria in enumerate(CATEGORIAS)}
    if labels != esperado:
        logger.warning(
            "labels.json de %s NO coincide con la taxonomía de app/config.py — "
            "si entrenaste con otro orden de categorías, las predicciones van a "
            "estar desalineadas. Revísalo antes de confiar en modo 'real'.",
            models_dir,
        )


def cargar_registro(models_dir: Path | None = None) -> Registro:
    models_dir = models_dir or settings.models_dir
    registro = Registro()

    if not models_dir.exists():
        logger.info("MODELS_DIR (%s) no existe — arrancando en modo demo.", models_dir)
        return registro

    _validar_labels(models_dir)

    for codigo, arquitectura in ARQUITECTURA_POR_CODIGO.items():
        carpeta = models_dir / codigo
        ruta_modelo = carpeta / "modelo.pt"
        if ruta_modelo.exists():
            try:
                registro.modelos_imagen[codigo] = cargador_imagen.cargar(ruta_modelo, codigo, arquitectura)
                registro.metricas[codigo] = _leer_metricas(carpeta)
                registro.arquitecturas[codigo] = arquitectura
                logger.info("Cargado %s (%s)", codigo, arquitectura)
            except Exception:
                logger.exception("No se pudo cargar %s desde %s", codigo, ruta_modelo)

    carpeta_beto = models_dir / "cu2-beto-v1"
    if (carpeta_beto / "config.json").exists():
        try:
            registro.modelo_beto = cargador_texto.cargar_beto(carpeta_beto, "cu2-beto-v1")
            registro.metricas["cu2-beto-v1"] = _leer_metricas(carpeta_beto)
            registro.arquitecturas["cu2-beto-v1"] = "BETO (bert-base-spanish-wwm-cased)"
            logger.info("Cargado cu2-beto-v1")
        except Exception:
            logger.exception("No se pudo cargar cu2-beto-v1 desde %s", carpeta_beto)

    carpeta_tfidf = models_dir / "cu2-tfidf-logreg-v1"
    ruta_tfidf = carpeta_tfidf / "pipeline.joblib"
    if ruta_tfidf.exists():
        try:
            registro.modelo_tfidf = cargador_texto.cargar_tfidf(ruta_tfidf, "cu2-tfidf-logreg-v1")
            registro.metricas["cu2-tfidf-logreg-v1"] = _leer_metricas(carpeta_tfidf)
            registro.arquitecturas["cu2-tfidf-logreg-v1"] = "TF-IDF + Regresión logística"
            logger.info("Cargado cu2-tfidf-logreg-v1")
        except Exception:
            logger.exception("No se pudo cargar cu2-tfidf-logreg-v1 desde %s", ruta_tfidf)

    if registro.modo == "demo":
        logger.warning("Ningún modelo entrenado encontrado en %s — modo DEMO.", models_dir)

    return registro
