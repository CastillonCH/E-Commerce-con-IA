"""CU2 — carga BETO (ml/notebooks/02_cu2_beto.ipynb) y/o el baseline
TF-IDF+LogReg (01_cu2_baseline_tfidf.ipynb) ya entrenados. Igual que con
imagen: BETO se carga desde una carpeta local (transformers
`from_pretrained` sobre un path, no un modelo remoto) — no necesita
internet en producción."""

from __future__ import annotations

from dataclasses import dataclass

import torch

from app.esquemas import TopK


@dataclass
class ModeloTextoBeto:
    codigo: str
    tokenizer: object
    modelo: object
    clases: list[str]  # modelo.config.id2label en orden de índice


def cargar_beto(ruta_carpeta, codigo: str) -> ModeloTextoBeto:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(ruta_carpeta)
    modelo = AutoModelForSequenceClassification.from_pretrained(ruta_carpeta)
    modelo.eval()
    clases = [modelo.config.id2label[i] for i in range(len(modelo.config.id2label))]
    return ModeloTextoBeto(codigo=codigo, tokenizer=tokenizer, modelo=modelo, clases=clases)


def clasificar_beto(modelo_texto: ModeloTextoBeto, titulo: str, descripcion: str = "", k: int = 5):
    texto = f"{titulo}. {descripcion}".strip()
    entrada = modelo_texto.tokenizer(texto, return_tensors="pt", truncation=True, max_length=128, padding=True)
    with torch.no_grad():
        logits = modelo_texto.modelo(**entrada).logits
        probabilidades = torch.softmax(logits, dim=1).squeeze(0)

    indice = int(torch.argmax(probabilidades).item())
    categoria = modelo_texto.clases[indice]
    confianza = float(probabilidades[indice].item())

    top_valores, top_indices = torch.topk(probabilidades, k=min(k, len(modelo_texto.clases)))
    top_k = [
        TopK(indice_clase=int(i), categoria=modelo_texto.clases[int(i)], prob=float(v))
        for v, i in zip(top_valores.tolist(), top_indices.tolist())
    ]
    return indice, categoria, confianza, top_k


def embedding_beto(modelo_texto: ModeloTextoBeto, titulo: str, descripcion: str = "") -> list[float]:
    """Mean pooling sobre la última capa oculta (768 dim) — mismo método
    que exporta el notebook de entrenamiento, para que los embeddings
    sean comparables entre lo que se guardó en producto_embeddings al
    entrenar (si se hizo) y lo que genera este servicio en producción."""
    texto = f"{titulo}. {descripcion}".strip()
    entrada = modelo_texto.tokenizer(texto, return_tensors="pt", truncation=True, max_length=128, padding=True)
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

    return ModeloTextoTfidf(codigo=codigo, pipeline=joblib.load(ruta_pipeline))


def clasificar_tfidf(modelo_texto: ModeloTextoTfidf, titulo: str, descripcion: str = "", k: int = 5):
    texto = f"{titulo}. {descripcion}".strip()
    clases = list(modelo_texto.pipeline.classes_)
    probabilidades = modelo_texto.pipeline.predict_proba([texto])[0]

    indice = int(probabilidades.argmax())
    categoria = clases[indice]
    confianza = float(probabilidades[indice])

    orden = probabilidades.argsort()[::-1][:k]
    top_k = [TopK(indice_clase=int(i), categoria=clases[int(i)], prob=float(probabilidades[i])) for i in orden]
    return indice, categoria, confianza, top_k
