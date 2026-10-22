"""CU2 — carga BETO (ml/notebooks/02_cu2_beto.ipynb) y/o el baseline
TF-IDF+LogReg (01_cu2_baseline_tfidf.ipynb) ya entrenados. Igual que con
imagen: BETO se carga desde una carpeta local (transformers
`from_pretrained` sobre un path, no un modelo remoto) — no necesita
internet en producción."""

from __future__ import annotations

from dataclasses import dataclass

import torch

from app.modelos.distribucion import a_taxonomia, resumir, validar_clases

MAX_LENGTH_POR_DEFECTO = 128


def texto_entrada(titulo: str, descripcion: str = "") -> str:
    """Mismo formato que arma ml/preparar_dataset.py para entrenar
    ("título. descripción", descripción cortada a 400 caracteres)."""
    descripcion = (descripcion or "").strip()[:400]
    return f"{titulo.strip()}. {descripcion}".strip() if descripcion else titulo.strip()


@dataclass
class ModeloTextoBeto:
    codigo: str
    tokenizer: object
    modelo: object
    clases: list[str]  # modelo.config.id2label en orden de índice
    max_length: int = MAX_LENGTH_POR_DEFECTO


def cargar_beto(ruta_carpeta, codigo: str) -> ModeloTextoBeto:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(ruta_carpeta)
    modelo = AutoModelForSequenceClassification.from_pretrained(ruta_carpeta)
    modelo.eval()
    clases = [modelo.config.id2label[i] for i in range(len(modelo.config.id2label))]
    validar_clases(clases, f"{codigo} ({ruta_carpeta})")
    # El script de entrenamiento guarda en el tokenizer el max_length con
    # el que entrenó; si no está (o es el "infinito" por defecto), 128.
    max_length = getattr(tokenizer, "model_max_length", MAX_LENGTH_POR_DEFECTO)
    if not isinstance(max_length, int) or max_length > 512:
        max_length = MAX_LENGTH_POR_DEFECTO
    return ModeloTextoBeto(codigo=codigo, tokenizer=tokenizer, modelo=modelo, clases=clases, max_length=max_length)


def distribucion_beto(modelo_texto: ModeloTextoBeto, titulo: str, descripcion: str = "") -> list[float]:
    entrada = modelo_texto.tokenizer(
        texto_entrada(titulo, descripcion), return_tensors="pt", truncation=True, max_length=modelo_texto.max_length
    )
    with torch.no_grad():
        probabilidades = torch.softmax(modelo_texto.modelo(**entrada).logits, dim=1).squeeze(0).tolist()
    return a_taxonomia(probabilidades, modelo_texto.clases)


def clasificar_beto(modelo_texto: ModeloTextoBeto, titulo: str, descripcion: str = "", k: int = 5):
    return resumir(distribucion_beto(modelo_texto, titulo, descripcion), k)


def embedding_beto(modelo_texto: ModeloTextoBeto, titulo: str, descripcion: str = "") -> list[float]:
    """Mean pooling sobre la última capa oculta (768 dim) — mismo método
    que exporta el notebook de entrenamiento, para que los embeddings
    sean comparables entre lo que se guardó en producto_embeddings al
    entrenar (si se hizo) y lo que genera este servicio en producción."""
    entrada = modelo_texto.tokenizer(
        texto_entrada(titulo, descripcion), return_tensors="pt", truncation=True, max_length=modelo_texto.max_length
    )
    with torch.no_grad():
        salida = modelo_texto.modelo.base_model(**entrada)
        mascara = entrada["attention_mask"].unsqueeze(-1).float()
        suma = (salida.last_hidden_state * mascara).sum(1)
        conteo = mascara.sum(1).clamp(min=1e-9)
        vector = (suma / conteo).squeeze(0)
    return vector.tolist()


@dataclass
class ModeloTextoTfidf:
    codigo: str
    pipeline: object  # sklearn Pipeline (TfidfVectorizer + LogisticRegression)


def cargar_tfidf(ruta_pipeline, codigo: str) -> ModeloTextoTfidf:
    import joblib

    pipeline = joblib.load(ruta_pipeline)
    validar_clases([str(c) for c in pipeline.classes_], f"{codigo} ({ruta_pipeline})")
    return ModeloTextoTfidf(codigo=codigo, pipeline=pipeline)


def distribucion_tfidf(modelo_texto: ModeloTextoTfidf, titulo: str, descripcion: str = "") -> list[float]:
    # classes_ de sklearn viene en orden alfabético: a_taxonomia lo
    # reordena por nombre al orden de indice_clase.
    probabilidades = modelo_texto.pipeline.predict_proba([texto_entrada(titulo, descripcion)])[0]
    return a_taxonomia(probabilidades.tolist(), [str(c) for c in modelo_texto.pipeline.classes_])


def clasificar_tfidf(modelo_texto: ModeloTextoTfidf, titulo: str, descripcion: str = "", k: int = 5):
    return resumir(distribucion_tfidf(modelo_texto, titulo, descripcion), k)
