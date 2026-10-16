# Formato de datos para entrenar CU1 y CU2

## CU1 — Imágenes (`scripts/train_cu1_image.py`)

Una carpeta por categoría, nombre **exacto** (con tildes) a como aparece
en `app/config.py` / `lib/taxonomy.ts` / Tabla 2 del T1:

```
data/images/
  Audio y audífonos/
    foto001.jpg
    foto002.jpg
    ...
  Laptops y computadoras/
    ...
  Relojes inteligentes y wearables/
    ...
  ... (21 carpetas en total, una por cada categoría)
```

El script valida que las 21 carpetas estén presentes y con el nombre
exacto antes de entrenar — si falta una o está mal escrita, te dice
cuál.

**Cuántas imágenes por categoría hacen falta.** No hay un mínimo mágico;
con transfer learning (congelando casi toda la red) se puede entrenar con
relativamente pocas por clase, pero menos de ~50-80 imágenes por
categoría da métricas inestables entre corridas. Para acercarte a la meta
de OE1 (accuracy ≥80%, F1-macro ≥0.75) sobre 21 clases, apunta a al menos
100-150 imágenes por categoría si puedes.

## CU2 — Texto (`scripts/train_cu2_text.py`)

Un CSV con columnas `nombre`, `descripcion` (puede ir vacía) y
`categoria` (uno de los 21 nombres exactos):

```csv
nombre,descripcion,categoria
"Parlante Bluetooth JBL Flip 6","Resistente al agua, 12h de batería","Audio y audífonos"
"Laptop HP Pavilion 15 Ryzen 5","16GB RAM, 512GB SSD","Laptops y computadoras"
...
```

El texto suele ser más fácil de conseguir que las imágenes (títulos y
descripciones de producto existen en cualquier catálogo de e-commerce
público), así que probablemente valga la pena priorizar CU2 si el tiempo
apremia.
