"""MODO DEMO — se activa automáticamente cuando `MODELS_DIR` no tiene
ningún modelo entrenado cargado (ver app/modelos/registro.py). Clasifica
con reglas simples de palabras clave sobre el título, y genera
embeddings deterministas (hash del texto) solo para que el flujo de
alta de producto no se rompa en desarrollo.

Esto NUNCA debe confundirse con una predicción real: main.py siempre
marca `modo: "demo"` en la respuesta, y el frontend debe mostrar un
aviso visible cuando lo reciba (ver components/admin — panel de
sugerencia IA)."""

from __future__ import annotations

import hashlib

from app.config import CATEGORIAS
from app.esquemas import TopK

# Palabras clave en español por categoría — intencionalmente simple (no
# es NLP de verdad). Alcanza para que, sin ningún modelo entrenado, el
# flujo completo (alta de producto -> sugerencia -> revisión -> publicar)
# se pueda probar de punta a punta.
PALABRAS_CLAVE: dict[str, list[str]] = {
    "Audio y audífonos": ["audífono", "parlante", "altavoz", "bluetooth", "micrófono", "bocina"],
    "Laptops y computadoras": ["laptop", "notebook", "computadora", "pc", "monitor", "teclado"],
    "Relojes inteligentes y wearables": ["reloj", "smartwatch", "pulsera inteligente", "wearable"],
    "Electrodomésticos de cocina": ["licuadora", "microondas", "refrigeradora", "cocina", "horno", "hervidor"],
    "Muebles": ["mueble", "silla", "mesa", "sofá", "escritorio", "estante", "cama"],
    "Decoración y menaje": ["decoración", "cuadro", "florero", "vajilla", "menaje", "cortina"],
    "Casacas y abrigos": ["casaca", "abrigo", "chaqueta", "parka", "chompa"],
    "Zapatillas y calzado": ["zapatilla", "zapato", "calzado", "sandalia", "bota"],
    "Polos y camisas": ["polo", "camisa", "blusa", "camiseta"],
    "Balones": ["balón", "pelota de fútbol", "pelota de básquet"],
    "Ropa deportiva": ["ropa deportiva", "short deportivo", "licra", "deportivo"],
    "Equipos de fitness": ["mancuerna", "pesa", "banda elástica", "fitness", "gimnasio"],
    "Fragancias": ["perfume", "fragancia", "colonia", "eau de"],
    "Maquillaje": ["maquillaje", "labial", "rímel", "base de maquillaje", "sombra de ojos"],
    "Herramientas de belleza": ["brocha", "secadora", "plancha de cabello", "pinza de cejas"],
    "Bloques de construcción": ["bloque de construcción", "lego", "ladrillo de juguete"],
    "Peluches": ["peluche", "muñeco de felpa"],
    "Vehículos de juguete": ["carrito de juguete", "auto a escala", "camión de juguete"],
    "Bebidas": ["gaseosa", "jugo", "agua embotellada", "bebida", "cerveza", "vino"],
    "Abarrotes y snacks": ["snack", "galleta", "abarrote", "fideo", "arroz", "aceite"],
    "Limpieza del hogar": ["detergente", "lejía", "limpiador", "escoba", "trapeador"],
}

CATEGORIA_POR_DEFECTO = CATEGORIAS[0]
CONFIANZA_MAXIMA_DEMO = 0.45  # tope a propósito: nunca debe parecer una predicción real


def clasificar_demo(titulo: str, descripcion: str = "", k: int = 5) -> tuple[int, str, float, list[TopK]]:
    texto = f"{titulo} {descripcion}".lower()

    puntajes = {categoria: 0 for categoria in CATEGORIAS}
    for categoria, palabras in PALABRAS_CLAVE.items():
        puntajes[categoria] = sum(1 for palabra in palabras if palabra in texto)

    total = sum(puntajes.values())
    if total == 0:
        # Ninguna palabra clave matcheó: confianza mínima, categoría fija.
        categoria = CATEGORIA_POR_DEFECTO
        confianza = 1 / len(CATEGORIAS)
        top_k = [TopK(indice_clase=i, categoria=c, prob=confianza) for i, c in enumerate(CATEGORIAS[:k])]
        return CATEGORIAS.index(categoria), categoria, confianza, top_k

    ranking = sorted(puntajes.items(), key=lambda par: par[1], reverse=True)
    categoria_top, puntaje_top = ranking[0]
    confianza = min(CONFIANZA_MAXIMA_DEMO, puntaje_top / total)

    top_k = [
        TopK(indice_clase=CATEGORIAS.index(categoria), categoria=categoria, prob=min(CONFIANZA_MAXIMA_DEMO, puntaje / total))
        for categoria, puntaje in ranking[:k]
        if puntaje > 0
    ]
    return CATEGORIAS.index(categoria_top), categoria_top, confianza, top_k


def embedding_demo(texto: str, dimension: int) -> list[float]:
    """Vector determinista (mismo texto -> mismo vector siempre) a partir
    de un hash — NO tiene ningún significado semántico, es solo plomería
    para que el resto del flujo (CU5, guardar en producto_embeddings)
    tenga algo con la forma correcta mientras no hay modelo real. El
    llamador (Next.js) decide si de verdad lo persiste — ver F4.6."""
    vector = []
    semilla = texto.encode("utf-8")
    contador = 0
    while len(vector) < dimension:
        digest = hashlib.sha256(semilla + contador.to_bytes(4, "big")).digest()
        for byte in digest:
            vector.append((byte / 255.0) * 2 - 1)  # a [-1, 1]
            if len(vector) >= dimension:
                break
        contador += 1
    return vector
