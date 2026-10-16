"""Servicio de IA de NovaStore — CU1 (imagen) + CU2 (texto) combinados.

Único endpoint que consume el frontend (ver lib/api.ts::createProduct):
POST /api/productos, multipart/form-data con nombre, precio, stock,
marca, departamento, imagen. Responde CreateProductResponse tal cual lo
espera types/index.ts — el frontend nunca ve que por dentro corrimos dos
modelos (ensemble.py).
"""

import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DEPARTAMENTOS, settings
from app.inference.ensemble import predecir
from app.inference.image_classifier import ModeloNoEntrenadoError
from app.schemas import AIResponse, CreateProductResponse, Producto
from app.storage import guardar_imagen

app = FastAPI(title="NovaStore — Módulo de IA", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["POST"],
    allow_headers=["*"],
)

settings.local_media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.local_media_dir), name="media")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/productos", response_model=CreateProductResponse)
async def crear_producto(
    nombre: str = Form(...),
    precio: float = Form(...),
    stock: int = Form(...),
    marca: str = Form(...),
    departamento: str = Form(...),
    imagen: UploadFile = File(...),
) -> CreateProductResponse:
    if departamento not in DEPARTAMENTOS:
        raise HTTPException(status_code=422, detail=f"Departamento inválido: {departamento}")

    imagen_bytes = await imagen.read()
    await imagen.seek(0)

    try:
        categoria, confianza = predecir(imagen_bytes, nombre)
    except ModeloNoEntrenadoError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    imagen_url = await guardar_imagen(imagen)

    return CreateProductResponse(
        producto=Producto(
            id=str(uuid.uuid4()),
            nombre=nombre,
            precio=precio,
            stock=stock,
            marca=marca,
            departamento=departamento,
            imagen_url=imagen_url,
            categoria_ia=categoria,
        ),
        ai=AIResponse(success=True, predicted_category=categoria, accuracy=confianza),
    )
