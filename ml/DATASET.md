# Dataset de entrenamiento — fuentes, licencias y limitaciones

Lo arma `ml/preparar_dataset.py` (orquestador) con `ml/fuentes_datos.py`
(una función por fuente). Cómo correrlo: `docs/ENTRENAMIENTO_LOCAL.md`.

## Por qué hay tres fuentes y no una

La primera versión usaba solo `Shopify/product-catalogue` (split train, 300
por clase) y quedó en **2 935 productos con 11 de las 21 clases por debajo
de 100 ejemplos** — algunas con 10-21 (Relojes 10, Peluches 15, Bloques
18, Balones 21, Fragancias 21). Con 15% para test, esas clases tenían 2-3
ejemplos de prueba: su F1 pasaba a depender de acertar o fallar uno o dos
productos, y el F1-macro (que promedia las 21 clases por igual) quedaba
bajo y muy ruidoso. Contando el dataset COMPLETO (los dos splits, 48 289
productos) con el mismo mapeo, el techo de Shopify para esas clases sigue
siendo bajísimo (Relojes 15, Peluches 18, Fragancias 23, Balones 25,
Bloques 27): no es un problema de tope, el dataset casi no tiene esos
productos. Por eso se suman fuentes con licencia abierta para las clases
débiles.

## Fuentes

### Principal: Shopify/product-catalogue

- **Dónde:** https://huggingface.co/datasets/Shopify/product-catalogue
- **Licencia:** Apache-2.0
- **Tamaño:** 48 289 productos (train 38 631 + test 9 658), ~9.5 GB
- **Se usan los dos splits** (antes solo train). Se lee primero solo
  texto/categoría (lectura parcial de los parquet) y después se bajan
  solo las imágenes de las filas elegidas.
- **Columnas:** `product_title`, `product_description`, `product_image`,
  `ground_truth_category` (Google Product Taxonomy, mapeada con
  `mapeo_categorias.py`, ver abajo).

### Complemento: Fashion Product Images (Small)

- **Dónde:** Kaggle `paramaggarwal/fashion-product-images-small`
  (espejo en Hugging Face: `ashraq/fashion-product-images-small`)
- **Licencia:** MIT (verificada en la API de Kaggle: `licenseNameNullable: "MIT"`)
- **Tamaño:** 44 072 productos de moda con `articleType`, `usage` y
  `productDisplayName` (título corto en inglés, sin descripción).
- **Mapeo** (`MODA_ARTICLE_TYPE` en `fuentes_datos.py`): Tshirts/Shirts/
  Tops → Polos y camisas; Jackets/Rain Jacket → Casacas y abrigos; los
  calzados → Zapatillas y calzado; Watches → Relojes; Perfume and Body
  Mist/Fragrance Gift Set → Fragancias (desodorantes NO); labiales,
  esmaltes, delineadores, bases, máscaras, sombras, rubores →
  Maquillaje; Track Pants/Tracksuits y cualquier prenda con
  `usage == "Sports"` → Ropa deportiva (así un polo deportivo no cae en
  "Polos y camisas").
- **Limitación:** las imágenes son de 60x80 px. Ver "Sesgo por fuente".

### Complemento: Amazon Berkeley Objects (ABO)

- **Dónde:** https://amazon-berkeley-objects.s3.amazonaws.com
- **Licencia:** CC BY 4.0
- **Cómo se usa:** metadatos (`listings/metadata/*.json.gz`, ~90 MB) e
  imágenes "small" (hasta 256 px) bajadas archivo por archivo — no hace
  falta el tar de varios GB.
- **Mapeo por `product_type`** (`ABO_PRODUCT_TYPE`), **revisado contra
  nombres reales** antes de usarlo:
  - SHOES/BOOT/SANDAL/TECHNICAL_SPORT_SHOE → Zapatillas y calzado
  - WATCH → Relojes; maquillaje (LIP_COLOR, EYELID_COLOR, MASCARA, …) →
    Maquillaje; COSMETIC_BRUSH/HAIR_IRON → Herramientas de belleza;
    TOY_BUILDING_BLOCK → Bloques de construcción
  - RECREATION_BALL → Balones **solo si el nombre es de un balón
    deportivo**: el tipo mezcla balones de fútbol con *medicine balls* y
    *slam balls* de gimnasio.
  - TOY_FIGURE/TOYS_AND_GAMES → Peluches **solo si el nombre lo indica**
    (son casi todos peluches "Jam & Honey", pero no todos).
  - **Descartados a propósito:** NOTEBOOK_COMPUTER, PERSONAL_COMPUTER y
    COMPUTER (traen cables, hubs y brazos de monitor, no computadoras) y
    NON_RIDING_TOY_VEHICLE (traía baterías).
- **Títulos:** se prefiere el nombre en español (ABO tiene es_MX/es_ES/
  es_US para parte del catálogo); si no, el inglés; otros idiomas se
  descartan (el traductor es solo inglés → español).
- **Duplicados:** el mismo producto aparece en varios mercados y tallas
  con la MISMA foto; se deduplica por imagen para que copias casi
  idénticas no caigan a la vez en train y en test.

## Selección por clase

`preparar_dataset.py` (por defecto):

1. Deduplica por título+descripción entre todas las fuentes.
2. Por categoría, toma primero Shopify (hasta 500, muestra con semilla 42
   si hay más) y completa el cupo con las fuentes complementarias,
   **cada una con un tope de 300 por clase**, para que ninguna fuente
   externa domine una clase.

Resultado de la corrida de referencia (6 534 productos):

| Categoría | Shopify | Moda (MIT) | ABO | Total |
|---|---:|---:|---:|---:|
| Audio y audífonos | 411 | 0 | 0 | 411 |
| Laptops y computadoras | 70 | 0 | 0 | **70** |
| Relojes inteligentes y wearables | 15 | 300 | 20 | 335 |
| Electrodomésticos de cocina | 425 | 0 | 0 | 425 |
| Muebles | 500 | 0 | 0 | 500 |
| Decoración y menaje | 500 | 0 | 0 | 500 |
| Casacas y abrigos | 112 | 163 | 0 | 275 |
| Zapatillas y calzado | 63 | 218 | 219 | 500 |
| Polos y camisas | 59 | 300 | 0 | 359 |
| Balones | 25 | 0 | 23 | **48** |
| Ropa deportiva | 112 | 300 | 0 | 412 |
| Equipos de fitness | 500 | 0 | 0 | 500 |
| Fragancias | 23 | 300 | 0 | 323 |
| Maquillaje | 128 | 300 | 41 | 469 |
| Herramientas de belleza | 234 | 0 | 23 | 257 |
| Bloques de construcción | 27 | 0 | 5 | **32** |
| Peluches | 18 | 0 | 41 | **59** |
| Vehículos de juguete | 45 | 0 | 0 | **45** |
| Bebidas | 306 | 0 | 0 | 306 |
| Abarrotes y snacks | 500 | 0 | 0 | 500 |
| Limpieza del hogar | 208 | 0 | 0 | 208 |

Las clases con menos de 100 ejemplos bajaron de 11 a 5 (en negrita).
**Siguen débiles** Laptops, Balones, Bloques, Peluches y Vehículos de
juguete: ninguna de las tres fuentes tiene más de esos productos con
etiqueta confiable. Se probó relabelear filas de Shopify por palabras
clave ("plush", "lego", "die-cast", …) y se descartó: las coincidencias
eran mayormente ruido (camas para mascotas, toallas, accesorios de baño
"DUPLO", martillos "die-cast").

## Sesgo por fuente (y cómo se controla)

Las fuentes no se ven igual: Moda trae fotos de estudio de 60x80 px;
ABO, fotos de catálogo de Amazon con fondo blanco; Shopify, fotos reales
de tiendas. Un modelo podría aprender "foto chica y borrosa = clase de
moda" en vez de mirar el producto, y eso inflaría las métricas de test
(que tienen la misma mezcla) sin servir para fotos reales de vendedores.
Por eso:

- `entrenar_cu1.py` aplica a TODAS las imágenes de entrenamiento una
  degradación de resolución aleatoria (`BajaResolucionAleatoria`), para
  que la resolución deje de delatar la fuente.
- Todos los scripts reportan las métricas **también separadas por
  fuente** (`por_fuente` en `metricas.json`). La de `shopify` es la más
  cercana al caso real (fotos de vendedores) y la más comparable con la
  corrida anterior.

## El mapeo de categorías de Shopify (`mapeo_categorias.py`)

Mapea por PREFIJO de `ground_truth_category` (gana el prefijo más largo).
Cada prefijo está marcado `confirmado=True` (visto tal cual en el dataset)
o `confirmado=False` (inferido de la taxonomía pública de Google).
Varios prefijos inferidos "a ojo" resultaron tener otro nombre exacto en
este dataset y se corrigieron contra datos reales:

| Categoría NovaStore | Prefijo que se asumió primero | Prefijo real confirmado |
|---|---|---|
| Relojes inteligentes y wearables | `Jewelry > Watches` | `Jewelry > Smart Watches` |
| Equipos de fitness | `Sporting Goods > Exercise & Fitness` | `Sporting Goods > Fitness & General Exercise Equipment` |
| Fragancias | `Cosmetics > Perfume & Cologne` | `Cosmetics > Perfumes & Colognes` |
| Maquillaje | `Cosmetics > Make-Up` (con guion) | `Cosmetics > Makeup` (sin guion) |
| Herramientas de belleza | `Cosmetics > Make-Up Tools` | `Cosmetics > Cosmetic Tools` |

## Traducción a español (`traducir_a_espanol`)

BETO espera texto en español. El texto de entrada es "título.
descripción" (descripción cortada a 400 caracteres) — el mismo formato
que arma ai-service al clasificar. Lo que `langdetect` no identifica como
español (o lo que ABO ya trae en español) se traduce con
`Helsinki-NLP/opus-mt-en-es` usando búsqueda greedy (2.4x más rápida que
la de 4 haces y sin pérdida apreciable en las pruebas). Las traducciones
se guardan en `datos/cache/traducciones.json`: una segunda corrida no
vuelve a traducir lo mismo.

**Limitación metodológica:** el traductor es inglés → español. Un texto
en un tercer idioma (se vieron títulos en sueco en Shopify) se traduce
igual y puede quedar de mala calidad. Se documenta en vez de filtrar
porque filtrar achicaría todavía más las clases débiles.

## Partición

70 % entrenamiento / 15 % validación / 15 % prueba, estratificada por
categoría, semilla 42 (`particionar()`). **Todos los scripts y notebooks
usan exactamente esta partición** para que CU1, CU2 y la fusión sean
comparables. Si una clase tiene menos de 10 ejemplos, `particionar()` se
niega a partir y explica por qué (la corrida anterior había bajado ese
mínimo a 3, lo que dejaba clases con 1 ejemplo de test).

**Importante:** al cambiar el dataset cambió la partición, así que las
métricas nuevas no son directamente comparables con las del PR #5. Para
compararlas de forma justa, `docs/MEJORA_MODELOS_IA.md` reporta también
el baseline viejo reproducido sobre la partición nueva.

## Reproducibilidad: versiones fijadas (`requirements.txt`)

`datasets==3.2.0` + `transformers==4.47.1` están fijados a propósito:
`transformers` 5.x eliminó el pipeline de traducción y además genera
conflictos con `datasets`. No actualices estas dos librerías sueltas sin
volver a probar `preparar_dataset.py`.
