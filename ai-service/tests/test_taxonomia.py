"""El índice de salida de un modelo NO es el indice_clase de la taxonomía:
depende del orden con que se entrenó (alfabético en sklearn, y en los
scripts anteriores de entrenamiento también). Estas pruebas fallaban con
la versión que usaba la posición de salida como indice_clase."""

from pathlib import Path

import joblib
import pytest
import torch
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.config import CATEGORIAS
from app.main import fusionar
from app.modelos import cargador_imagen, cargador_texto
from app.modelos.cargador_imagen import _construir_arquitectura
from app.modelos.distribucion import ClasesNoCoincidenError, a_taxonomia
from app.modelos.registro import cargar_registro

ALFABETICO = sorted(CATEGORIAS)


def _checkpoint_que_siempre_predice(carpeta: Path, categoria: str, clases: list[str]) -> Path:
    modelo = _construir_arquitectura("resnet50", num_clases=len(clases))
    with torch.no_grad():
        modelo.fc.weight.zero_()
        modelo.fc.bias.fill_(-10.0)
        modelo.fc.bias[clases.index(categoria)] = 10.0
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / "modelo.pt"
    torch.save({"modelo": modelo.state_dict(), "clases": clases}, ruta)
    return ruta


def test_imagen_con_clases_en_orden_alfabetico_devuelve_el_indice_de_la_taxonomia(tmp_path, imagen_de_prueba_bytes):
    # "Abarrotes y snacks" es el índice 0 alfabético pero el 19 de la taxonomía.
    categoria = "Abarrotes y snacks"
    ruta = _checkpoint_que_siempre_predice(tmp_path / "cu1-resnet50-v1", categoria, ALFABETICO)
    modelo = cargador_imagen.cargar(ruta, "cu1-resnet50-v1", "resnet50")

    indice, nombre, confianza, top_k = cargador_imagen.clasificar(modelo, imagen_de_prueba_bytes)

    assert nombre == categoria
    assert indice == CATEGORIAS.index(categoria) == 19
    assert confianza > 0.99
    assert all(CATEGORIAS[t.indice_clase] == t.categoria for t in top_k)


def test_tfidf_de_sklearn_clases_alfabeticas_se_mapean_por_nombre(tmp_path):
    textos = [f"producto de tipo {i} {c}" for i, c in enumerate(CATEGORIAS) for _ in range(3)]
    etiquetas = [c for c in CATEGORIAS for _ in range(3)]
    pipeline = Pipeline([("tfidf", TfidfVectorizer()), ("clf", LogisticRegression(C=100, max_iter=2000))]).fit(textos, etiquetas)
    assert list(pipeline.classes_) == ALFABETICO  # sklearn ordena alfabéticamente
    joblib.dump(pipeline, tmp_path / "pipeline.joblib")
    modelo = cargador_texto.cargar_tfidf(tmp_path / "pipeline.joblib", "cu2-tfidf-logreg-v1")

    indice, nombre, _, top_k = cargador_texto.clasificar_tfidf(modelo, "producto de tipo 19 Abarrotes y snacks")

    assert nombre == "Abarrotes y snacks"
    assert indice == CATEGORIAS.index("Abarrotes y snacks")
    assert all(CATEGORIAS[t.indice_clase] == t.categoria for t in top_k)


def test_fusion_promedia_imagenes_y_pondera_texto_en_el_orden_de_la_taxonomia():
    n = len(CATEGORIAS)
    imagen_a = a_taxonomia([1.0 if c == "Muebles" else 0.0 for c in ALFABETICO], ALFABETICO)
    imagen_b = [1.0 if i == CATEGORIAS.index("Decoración y menaje") else 0.0 for i in range(n)]
    texto = [1.0 if i == CATEGORIAS.index("Decoración y menaje") else 0.0 for i in range(n)]

    resultado = fusionar([imagen_a, imagen_b], texto, peso_imagen=0.6)

    # imagen promedio: Muebles 0.5, Decoración 0.5 -> 0.6*0.5 + 0.4*1.0 = 0.7 para Decoración
    assert resultado.categoria == "Decoración y menaje"
    assert resultado.indice_clase == CATEGORIAS.index("Decoración y menaje")
    assert resultado.confianza == pytest.approx(0.7)


def test_fusion_con_una_sola_modalidad_usa_solo_esa():
    n = len(CATEGORIAS)
    texto = [1.0 if i == 4 else 0.0 for i in range(n)]
    assert fusionar([], texto, peso_imagen=0.6).indice_clase == 4


def test_artefacto_con_clases_fuera_de_la_taxonomia_no_se_carga(tmp_path):
    clases = [*CATEGORIAS[:-1], "Categoría Inventada"]
    ruta = _checkpoint_que_siempre_predice(tmp_path / "models" / "cu1-resnet50-v1", clases[0], clases)

    with pytest.raises(ClasesNoCoincidenError):
        cargador_imagen.cargar(ruta, "cu1-resnet50-v1", "resnet50")
    # registro.py lo registra en el log y lo saltea: el servicio sigue en demo.
    assert cargar_registro(tmp_path / "models").modo == "demo"
