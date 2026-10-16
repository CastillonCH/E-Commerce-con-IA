# Dataset de entrenamiento — fuentes, licencias y limitaciones

## Fuentes

### Principal: Shopify/product-catalogue

- **Dónde:** https://huggingface.co/datasets/Shopify/product-catalogue
- **Licencia:** Apache-2.0
- **Tamaño:** 48 289 productos (train: 38 631), ~9.5 GB
- **Columnas usadas:** `product_title`, `product_description`,
  `product_image` (binario), `ground_truth_category` (jerárquica,
  separada por " > ", es la taxonomía pública de Google Product Taxonomy)
- Confirmado contactando la API pública de `datasets-server` de Hugging
  Face y leyendo ~2 400 valores reales y únicos de `ground_truth_category`
  antes de escribir `mapeo_categorias.py` — no es un mapeo adivinado.

### Complemento opcional: Amazon Berkeley Objects (ABO)

- **Dónde:** https://amazon-berkeley-objects.s3.amazonaws.com
- **Licencia:** CC BY 4.0
- **Uso:** solo si una categoría queda con menos de 100 ejemplos después
  de Shopify/product-catalogue, y solo si se corre
  `preparar_dataset.py --complementar-abo` (desactivado por defecto).
  Ver `abo_complemento.py` — **la lógica está escrita pero no se corrió
  de punta a punta en este sandbox** (los archivos de ABO pesan varios
  GB); revísala con cuidado la primera vez que la actives.

## El mapeo de categorías (`mapeo_categorias.py`)

Shopify/product-catalogue no tiene las 21 categorías de NovaStore —
tiene la taxonomía completa de Google Product Taxonomy (miles de clases,
cola muy larga). `mapeo_categorias.py` mapea por PREFIJO: si
`ground_truth_category` empieza con uno de los prefijos listados para
una categoría de NovaStore, el producto se queda con esa categoría; si no
matchea ningún prefijo, se descarta.

Cada prefijo está marcado `confirmado=True` o `confirmado=False`:

- `confirmado=True`: se vio tal cual en la muestra real de ~2 400
  categorías únicas que se sacó del dataset antes de escribir el mapeo.
- `confirmado=False`: no apareció en esa muestra (el dataset completo
  tiene muchas más categorías únicas que las 2 400 muestreadas), pero es
  parte de la taxonomía estándar de Google Product Taxonomy, así que es
  razonable que exista en alguna de las 48 289 filas.

Al correr `preparar_dataset.py` contra el dataset completo, revisa el
reporte de conteo por clase. Si alguna categoría queda floja, el primer
lugar a mirar es si sus prefijos son todos `confirmado=False` — puede que
el prefijo real tenga una palabra distinta a la que se infirió acá.

**Hallazgo real durante la validación:** varios prefijos que se habían
inferido "a ojo" de la taxonomía estándar resultaron tener el nombre
exacto distinto en este dataset en particular. Ejemplos corregidos tras
verificar contra datos reales:

| Categoría NovaStore | Prefijo que se asumió primero | Prefijo real confirmado |
|---|---|---|
| Relojes inteligentes y wearables | `Jewelry > Watches` | `Jewelry > Smart Watches` |
| Equipos de fitness | `Sporting Goods > Exercise & Fitness` | `Sporting Goods > Fitness & General Exercise Equipment` |
| Fragancias | `Cosmetics > Perfume & Cologne` | `Cosmetics > Perfumes & Colognes` |
| Maquillaje | `Cosmetics > Make-Up` (con guion) | `Cosmetics > Makeup` (sin guion) |
| Herramientas de belleza | `Cosmetics > Make-Up Tools` | `Cosmetics > Cosmetic Tools` (incluye Makeup/Nail/Skin Care Tools) |

Por eso el mapeo se construyó así — adivinar el nombre exacto de un nodo
de una taxonomía de miles de clases, sin verificar, es una fuente de bugs
silenciosos (la categoría simplemente queda vacía y nadie se entera hasta
entrenar con un dataset incompleto).

**Categoría sin confirmar al cierre de este documento:** "Peluches"
(`Toys & Games > Toys > Stuffed Animals & Plush Toys`, inferido de la
taxonomía estándar) — no apareció en la muestra de ~2 400 categorías
únicas. Es muy probable que exista en el dataset completo (es una
categoría de producto muy común), pero revísala primero si "Peluches"
queda floja en el reporte.

## Traducción a español (`traducir_a_espanol`)

BETO (CU2) espera texto en español. El dataset tiene productos en varios
idiomas (se confirmó al menos inglés y sueco en una muestra real). La
consigna del proyecto fue traducir con `Helsinki-NLP/opus-mt-en-es`
(inglés → español) todo texto que `langdetect` no identifique como
español.

**Limitación metodológica, confirmada empíricamente:** `opus-mt-en-es`
traduce inglés → español. Para un texto en un tercer idioma (en la
prueba, sueco), el modelo no traduce de verdad — en el mejor caso deja el
texto casi intacto (con capitalización rara), en el peor puede producir
texto sin sentido. No se implementó detección+filtro de "solo inglés"
porque descartar todo lo que no sea español o inglés reduciría aún más un
dataset ya chico; se documenta la limitación en vez de ocultarla. Si el
reporte de `preparar_dataset.py` muestra una proporción alta de idiomas
no-ingleses entre lo traducido, vale la pena revisar esos ejemplos a mano
antes de entrenar CU2, o acotar el dataset a title/description en inglés
únicamente (hay una señal indirecta: casi todo el dataset viene de
tiendas Shopify en inglés, así que debería ser una minoría).

## Partición

70 % entrenamiento / 15 % validación / 15 % prueba, estratificada por
categoría, semilla fija 42 (`particionar()` en `preparar_dataset.py`).
**Los 4 notebooks de la Fase 2 usan exactamente esta partición** — nunca
se vuelve a particionar dentro de un notebook — para que las métricas de
CU1, CU2 y la fusión sean comparables entre sí.

Si una categoría queda con menos de 10 ejemplos, `particionar()` se
niega a partir y explica por qué (una partición estratificada en 3 con
muy pocos ejemplos deja alguna categoría vacía en validación o prueba).
Esto se encontró y arregló durante el desarrollo: la primera versión
dejaba que `sklearn.train_test_split` fallara con un traceback críptico
—y en el camino, un hilo de fondo de la librería `datasets` llegaba a
tirar un error fatal del intérprete de Python al cerrar el proceso en
medio de una descarga—; ahora se valida antes y se corta con un mensaje
claro.

## Reproducibilidad: versiones fijadas (`requirements.txt`)

`datasets`, `transformers` y `huggingface-hub` tienen compatibilidad
cruzada frágil entre versiones recientes — se encontró en la práctica
que instalar `transformers` sin fijar versión (la más nueva disponible)
**eliminó el pipeline `"translation"` por completo** (removido en
transformers 5.x) y además generó un conflicto de dependencias con
`datasets`. `requirements.txt` fija `datasets==3.2.0` +
`transformers==4.47.1`, confirmado como una combinación que instala y
funciona sin conflictos. Los notebooks de Colab (Fase 2) instalan
exactamente estas versiones en su primera celda — no actualices estas
dos librerías sueltas sin volver a probar el pipeline de traducción.

## Qué falta por correr (no se hizo en este sandbox)

- La corrida completa de `preparar_dataset.py` contra el dataset entero
  (300 ejemplos/clase, sin `--limite-filas`) — se validó la lógica contra
  el dataset real pero con una muestra chica (hasta 3 000 filas, 10
  ejemplos/clase), no la corrida de producción completa. Esa corrida
  completa se hace en `00_preparar_dataset.ipynb`, en Colab, apuntando a
  Google Drive.
- El complemento opcional de ABO (`--complementar-abo`).
