"""Mapeo explícito de la taxonomía de Google/Shopify (`ground_truth_category`,
jerárquica, separada por " > ") a las 21 categorías de NovaStore.

Cómo se construyó: se muestrearon ~1900 filas reales de
`Shopify/product-catalogue` (vía la API pública de datasets-server de
Hugging Face) para confirmar qué prefijos existen de verdad en el dataset
antes de escribir este mapeo — no es una adivinanza. Los prefijos
marcados `# confirmado en muestra` aparecieron tal cual en esa muestra;
el resto se infiere de la taxonomía estándar de Google Product Taxonomy
(pública, https://support.google.com/merchants/answer/6324436), que es
la que usa este dataset, pero no se vieron en la muestra de ~1900 filas
(el dataset completo tiene 48 289 filas con una cola larga de miles de
categorías distintas).

Es un mapeo REVISABLE a propósito: si al correr preparar_dataset.py una
categoría queda con muy pocos ejemplos (ver el reporte que imprime),
revisa esta tabla primero — puede que falte un prefijo real del dataset.
"""

from dataclasses import dataclass

# Mismo orden que db/novastore_postgresql.sql (categorias.indice_clase,
# 0..20) y que ai-service/app/config.py — si cambias el orden acá,
# cámbialo en los tres lugares o las predicciones quedan desalineadas.
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

CATEGORIAS: list[str] = [
    categoria
    for departamento in DEPARTAMENTOS
    for categoria in CATEGORIAS_POR_DEPARTAMENTO[departamento]
]
INDICE_CLASE: dict[str, int] = {categoria: i for i, categoria in enumerate(CATEGORIAS)}
DEPARTAMENTO_DE: dict[str, str] = {
    categoria: departamento
    for departamento, categorias in CATEGORIAS_POR_DEPARTAMENTO.items()
    for categoria in categorias
}


@dataclass(frozen=True)
class Prefijo:
    texto: str
    confirmado: bool  # True = visto tal cual en la muestra de ~1900 filas


# Prefijos de Google Product Taxonomy -> categoría de NovaStore. Se evalúan
# todos; si varios matchean, gana el prefijo MÁS LARGO (más específico) —
# por eso el orden de la lista no importa para la lógica, solo para la
# lectura humana.
PREFIJOS: dict[str, list[Prefijo]] = {
    "Audio y audífonos": [
        Prefijo("Electronics > Audio", confirmado=True),
    ],
    "Laptops y computadoras": [
        Prefijo("Electronics > Computers", confirmado=True),
    ],
    "Relojes inteligentes y wearables": [
        Prefijo("Apparel & Accessories > Jewelry > Smart Watches", confirmado=True),
        Prefijo("Apparel & Accessories > Jewelry > Watches", confirmado=False),
    ],
    "Electrodomésticos de cocina": [
        Prefijo("Home & Garden > Kitchen & Dining > Kitchen Appliances", confirmado=True),
    ],
    "Muebles": [
        Prefijo("Furniture", confirmado=True),
    ],
    "Decoración y menaje": [
        Prefijo("Home & Garden > Decor", confirmado=True),
        Prefijo("Home & Garden > Kitchen & Dining > Tableware", confirmado=False),
    ],
    "Casacas y abrigos": [
        Prefijo("Apparel & Accessories > Clothing > Outerwear", confirmado=True),
    ],
    "Zapatillas y calzado": [
        Prefijo("Apparel & Accessories > Shoes", confirmado=True),
    ],
    "Polos y camisas": [
        Prefijo("Apparel & Accessories > Clothing > Clothing Tops", confirmado=True),
        Prefijo("Apparel & Accessories > Clothing > Shirts & Tops", confirmado=False),
    ],
    "Balones": [
        Prefijo("Sporting Goods > Athletics > Basketball > Basketballs", confirmado=True),
        Prefijo("Sporting Goods > Athletics > Baseball & Softball > Baseballs", confirmado=True),
        Prefijo("Sporting Goods > Athletics > Soccer > Soccer Balls", confirmado=False),
        Prefijo("Sporting Goods > Athletics > Volleyball > Volleyballs", confirmado=False),
        Prefijo("Sporting Goods > Athletics > American Football > Footballs", confirmado=False),
        Prefijo("Sporting Goods > Athletics > Rugby > Rugby Balls", confirmado=False),
    ],
    "Ropa deportiva": [
        Prefijo("Apparel & Accessories > Clothing > Activewear", confirmado=True),
    ],
    "Equipos de fitness": [
        Prefijo("Sporting Goods > Fitness & General Exercise Equipment", confirmado=True),
    ],
    "Fragancias": [
        # OJO: "Home & Garden > Decor > Home Fragrances" es fragancia de
        # AMBIENTE (velas, difusores) — NO va acá, es otra cosa por completo.
        Prefijo("Health & Beauty > Personal Care > Cosmetics > Perfumes & Colognes", confirmado=True),
    ],
    "Maquillaje": [
        Prefijo("Health & Beauty > Personal Care > Cosmetics > Makeup", confirmado=True),
    ],
    "Herramientas de belleza": [
        Prefijo("Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools", confirmado=True),
        Prefijo("Health & Beauty > Personal Care > Hair Care > Hair Styling Tools", confirmado=False),
    ],
    "Bloques de construcción": [
        Prefijo("Toys & Games > Toys > Building Toys", confirmado=True),
    ],
    "Peluches": [
        Prefijo("Toys & Games > Toys > Stuffed Animals & Plush Toys", confirmado=False),
    ],
    "Vehículos de juguete": [
        Prefijo("Toys & Games > Toys > Play Vehicles", confirmado=True),
    ],
    "Bebidas": [
        Prefijo("Food, Beverages & Tobacco > Beverages", confirmado=True),
    ],
    "Abarrotes y snacks": [
        Prefijo("Food, Beverages & Tobacco > Food Items", confirmado=True),
    ],
    "Limpieza del hogar": [
        Prefijo("Home & Garden > Household Supplies > Household Cleaning Supplies", confirmado=True),
    ],
}

assert set(PREFIJOS) == set(CATEGORIAS), "PREFIJOS debe cubrir las 21 categorías, ni más ni menos"


def mapear_categoria(ground_truth_category: str) -> str | None:
    """Devuelve el nombre de categoría de NovaStore para una
    `ground_truth_category` del dataset, o None si no matchea ningún
    prefijo (esa fila se descarta en preparar_dataset.py)."""
    if not ground_truth_category:
        return None

    mejor_categoria: str | None = None
    mejor_longitud = -1
    for categoria, prefijos in PREFIJOS.items():
        for prefijo in prefijos:
            if ground_truth_category.startswith(prefijo.texto) and len(prefijo.texto) > mejor_longitud:
                mejor_categoria = categoria
                mejor_longitud = len(prefijo.texto)
    return mejor_categoria


def exportar_labels(ruta: str = "ml/labels.json") -> None:
    import json

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({str(i): categoria for i, categoria in enumerate(CATEGORIAS)}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    exportar_labels()
    print(f"labels.json exportado con {len(CATEGORIAS)} categorías.")
