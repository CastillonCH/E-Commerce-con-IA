"""Servicio de IA de NovaStore — CU1 (imagen) + CU2 (texto), fusionados.

Único endpoint que de verdad consume el frontend (ver
lib/ai-client.ts): POST /clasificar. /health y /modelos son para
monitoreo y para la página /admin/modelos.

`crear_app()` es una fábrica (no un singleton a nivel de módulo) para que
los tests puedan levantar una instancia con un MODELS_DIR propio, con
artefactos diminutos generados en el momento — ver tests/.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import CATEGORIAS, DIMENSION_EMBEDDING, TAMANO_MAXIMO_IMAGEN_BYTES, TIPOS_IMAGEN_PERMITIDOS, settings
from app.esquemas import ClasificarResponse, EmbeddingSalida, HealthResponse, ModeloInfo, PorModelo, ResultadoClasificacion
from app.modelos import cargador_imagen, cargador_texto, demo
from app.modelos.distribucion import resumir
from app.modelos.registro import Registro, cargar_registro

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novastore_ia")


def crear_app(models_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="NovaStore — Módulo de IA", version="2.0.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])
    app.state.registro = cargar_registro(models_dir)

    def _registro() -> Registro:
        return app.state.registro

    def _exigir_api_key(x_api_key: str | None = Header(default=None)) -> None:
        if settings.ai_api_key and x_api_key != settings.ai_api_key:
            raise HTTPException(status_code=401, detail="X-API-Key inválida o ausente.")

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        registro = _registro()
        return HealthResponse(estado="ok", modo=registro.modo, modelos_cargados=registro.codigos_cargados)

    @app.get("/modelos", response_model=list[ModeloInfo], dependencies=[Depends(_exigir_api_key)])
    async def listar_modelos() -> list[ModeloInfo]:
        registro = _registro()
        info = []
        for codigo in ["cu1-resnet50-v1", "cu1-efficientnet-b0-v1", "cu2-beto-v1", "cu2-tfidf-logreg-v1"]:
            cargado = codigo in registro.codigos_cargados
            tipo = "imagen" if codigo.startswith("cu1") else "texto"
            info.append(
                ModeloInfo(
                    codigo=codigo,
                    arquitectura=registro.arquitecturas.get(codigo, "—"),
                    tipo=tipo,
                    metricas=registro.metricas.get(codigo, {}),
                    cargado=cargado,
                )
            )
        return info

    @app.post("/clasificar", response_model=ClasificarResponse, dependencies=[Depends(_exigir_api_key)])
    async def clasificar(
        titulo: str = Form(...),
        descripcion: str = Form(default=""),
        imagen: UploadFile = File(...),
    ) -> ClasificarResponse:
        inicio = time.perf_counter()
        registro = _registro()

        if imagen.content_type not in TIPOS_IMAGEN_PERMITIDOS:
            raise HTTPException(status_code=415, detail=f"Tipo de imagen no soportado: {imagen.content_type}. Usa PNG, JPG o WEBP.")
        imagen_bytes = await imagen.read()
        if len(imagen_bytes) > TAMANO_MAXIMO_IMAGEN_BYTES:
            raise HTTPException(status_code=413, detail="La imagen supera los 5 MB permitidos.")

        por_modelo: list[PorModelo] = []
        embeddings: list[EmbeddingSalida] = []

        if registro.modo == "demo":
            indice, categoria, confianza, top_k = demo.clasificar_demo(titulo, descripcion)
            por_modelo.append(PorModelo(codigo_modelo="demo", tipo="texto", indice_clase=indice, categoria=categoria, confianza=confianza, top_k=top_k))
            embeddings.append(EmbeddingSalida(codigo_modelo="demo", fuente="imagen", vector=demo.embedding_demo(titulo + descripcion, DIMENSION_EMBEDDING["cu1-resnet50-v1"])))
            embeddings.append(EmbeddingSalida(codigo_modelo="demo", fuente="texto", vector=demo.embedding_demo(titulo + descripcion, DIMENSION_EMBEDDING["cu2-beto-v1"])))
            resultado = ResultadoClasificacion(indice_clase=indice, categoria=categoria, confianza=confianza, top_k=top_k)
            latencia_ms = int((time.perf_counter() - inicio) * 1000)
            return ClasificarResponse(modo="demo", latencia_ms=latencia_ms, resultado=resultado, por_modelo=por_modelo, embeddings=embeddings)

        # Cada submodelo devuelve sus 21 probabilidades YA en el orden de
        # la taxonomía (ver app/modelos/distribucion.py), así se pueden
        # promediar posición a posición sin mezclar categorías.
        distribuciones_imagen: list[list[float]] = []
        distribucion_texto: list[float] | None = None

        for codigo, modelo_imagen in registro.modelos_imagen.items():
            try:
                vector = cargador_imagen.distribucion(modelo_imagen, imagen_bytes)
            except Exception:
                logger.exception("Fallo clasificando imagen con %s", codigo)
                continue
            _agregar_por_modelo(por_modelo, codigo, "imagen", vector)
            embeddings.append(EmbeddingSalida(codigo_modelo=codigo, fuente="imagen", vector=cargador_imagen.embedding(modelo_imagen, imagen_bytes)))
            distribuciones_imagen.append(vector)

        if registro.modelo_beto:
            distribucion_texto = cargador_texto.distribucion_beto(registro.modelo_beto, titulo, descripcion)
            _agregar_por_modelo(por_modelo, "cu2-beto-v1", "texto", distribucion_texto)
            embeddings.append(EmbeddingSalida(codigo_modelo="cu2-beto-v1", fuente="texto", vector=cargador_texto.embedding_beto(registro.modelo_beto, titulo, descripcion)))
        elif registro.modelo_tfidf:
            distribucion_texto = cargador_texto.distribucion_tfidf(registro.modelo_tfidf, titulo, descripcion)
            _agregar_por_modelo(por_modelo, "cu2-tfidf-logreg-v1", "texto", distribucion_texto)

        resultado = fusionar(distribuciones_imagen, distribucion_texto, settings.peso_fusion_imagen)
        latencia_ms = int((time.perf_counter() - inicio) * 1000)
        return ClasificarResponse(modo="real", latencia_ms=latencia_ms, resultado=resultado, por_modelo=por_modelo, embeddings=embeddings)

    return app


def _agregar_por_modelo(por_modelo: list[PorModelo], codigo: str, tipo: str, vector: list[float]) -> None:
    indice, categoria, confianza, top_k = resumir(vector)
    por_modelo.append(PorModelo(codigo_modelo=codigo, tipo=tipo, indice_clase=indice, categoria=categoria, confianza=confianza, top_k=top_k))


def fusionar(distribuciones_imagen: list[list[float]], distribucion_texto: list[float] | None, peso_imagen: float) -> ResultadoClasificacion:
    """P = peso_imagen * promedio(modelos de imagen) + (1 - peso_imagen) * P_texto.

    Es exactamente la misma fórmula con la que ml/evaluar_fusion.py elige
    PESO_FUSION_IMAGEN en validación, así el valor que recomienda ese
    script significa lo mismo acá. Si falta una de las dos modalidades,
    se usa solo la que hay."""
    if not distribuciones_imagen and distribucion_texto is None:
        raise HTTPException(status_code=503, detail="No hay modelos cargados para clasificar (ni en modo real ni demo).")

    n = len(CATEGORIAS)
    imagen = [sum(v[i] for v in distribuciones_imagen) / len(distribuciones_imagen) for i in range(n)] if distribuciones_imagen else None
    if imagen is None:
        combinado = distribucion_texto
    elif distribucion_texto is None:
        combinado = imagen
    else:
        combinado = [peso_imagen * imagen[i] + (1 - peso_imagen) * distribucion_texto[i] for i in range(n)]

    indice, categoria, confianza, top_k = resumir(combinado)
    return ResultadoClasificacion(indice_clase=indice, categoria=categoria, confianza=confianza, top_k=top_k)


app = crear_app()
