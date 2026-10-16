# NovaStore — Módulo de IA (CU1, CU2, CU5)

Servicio FastAPI que clasifica productos por imagen (CU1, ResNet-50) y
por texto (CU2, BETO), combina ambas señales, y expone endpoints de
embeddings reutilizables para la detección de duplicados (CU5). Es el
componente "Módulo de IA (PyTorch + Hugging Face)" de la plataforma
descrita en el T1 — hasta ahora era el único que no existía.

Arquitectura exacta como está planificada en `db/novastore_postgresql.sql`
(tabla `modelos_ia`, filas `cu1-resnet50-v1`, `cu1-efficientnet-b0-v1`,
`cu2-tfidf-logreg-v1`, `cu2-beto-v1`, todas con `estado = 'planificado'`
hasta que entrenes y actualices esa fila).

## Qué hay acá

```
app/
  config.py            Taxonomía (21 categorías) y settings
  schemas.py            Contrato con el frontend (types/index.ts)
  storage.py             Sube la foto a Azure Blob (o disco local en dev)
  main.py                 POST /api/productos — lo único que llama lib/api.ts
  inference/
    image_classifier.py   CU1: carga el checkpoint de ResNet-50 y predice
    text_classifier.py     CU2: carga el checkpoint de BETO y predice
    ensemble.py             Combina ambas predicciones en una sola
scripts/
  train_cu1_image.py    Entrena CU1 (transfer learning, ResNet-50/EfficientNet-B0)
  train_cu2_text.py      Entrena CU2 (baseline TF-IDF+LogReg + BETO fine-tuned)
  eval_cu5_duplicates.py  CU5: calcula embeddings y detecta duplicados
data/README.md          Formato exacto de datos que esperan los dos scripts
```

Validado en este sandbox: el servicio arranca, `/api/productos` responde
**503** con un mensaje claro si no hay ningún checkpoint entrenado (nunca
inventa una predicción), y responde 200 con la forma exacta que espera
`types/index.ts` cuando sí hay un checkpoint cargado. El ciclo completo de
`train_cu1_image.py` (carga de datos, validación de las 21 carpetas,
entrenamiento, guardado de checkpoint) se probó con un dataset sintético
diminuto. Lo que **no** se pudo probar acá, por las dos razones de abajo:
entrenar con los pesos reales de ImageNet/BETO, y el flujo completo de
`eval_cu5_duplicates.py` contra una Postgres con `pgvector`.

## Los dos bloqueos reales de este sandbox

**1. Sin GPU.** `nvidia-smi` no existe acá — 4 CPUs, sin acelerador.
Entrenar ResNet-50/BETO completos es viable en CPU para un dataset
pequeño (congelando casi toda la red, que es lo que hacen los scripts por
defecto), pero lento: cuenta horas, no minutos, para el dataset completo.

**2. `huggingface.co` y `download.pytorch.org` están bloqueados.** Este
sandbox solo permite salir a un puñado de hosts (pypi, npm, github...).
`pip install torch transformers` funciona perfecto (confirmado: lo
instalé y até un servidor real), pero **descargar los pesos
preentrenados de ImageNet (ResNet-50/EfficientNet-B0) o de BETO falla con
403** — lo until confirmé corriendo `train_cu1_image.py` de verdad.

**La solución para el bloqueo de red es tuya, directa:** en el menú del
entorno en la barra de título de esta sesión → *Edit* → *Network access*,
agrega `huggingface.co` y `download.pytorch.org` a los dominios
permitidos (o sube el nivel de acceso). Son dos clics; no depende de mí.

Para el bloqueo de GPU no hay un equivalente tan simple acá dentro — las
opciones reales son:

- **Entrenar en tu máquina o en Google Colab** (gratis, con GPU, sin
  restricción de red) y traer acá solo los checkpoints resultantes
  (`models/cu1_resnet50.pt`, `models/cu2_beto/`) — los scripts están
  pensados para correr igual en cualquiera de los dos lugares, no tienen
  nada específico de este sandbox.
- **Ensanchar la red de este sandbox y entrenar acá en CPU**, aceptando
  que va a ser lento (razonable para un dataset chico de prueba; no para
  el dataset completo de 100+ imágenes × 21 categorías).

## El dataset: no existe, hay que armarlo

Ver `data/README.md` para el formato exacto. Para conseguir las
imágenes/textos reales, en orden de esfuerzo:

1. **Amazon Berkeley Objects (ABO)** — el propio T1 lo cita como
   antecedente (Collins et al., 2022); es público, con fotos de producto
   reales y categorías que se pueden remapear a las 7 de NovaStore.
   Requiere descargarlo (es grande) desde tu máquina, donde no hay
   restricción de red, y luego reorganizarlo en las carpetas de
   `data/README.md`.
2. **Datasets temáticos públicos más chicos por departamento** (p. ej. uno
   de moda, uno de electrónica) combinados y remapeados a las 21
   categorías — más trabajo de curaduría pero datasets más manejables.
3. **Fotografía/etiquetado propio** — las 22 fotos de producto que ya
   trae `db/novastore_postgresql.sql` son un punto de partida (no
   alcanzan para entrenar solas, pero sirven para probar el pipeline de
   punta a punta con `--epochs` bajo antes de escalar el dataset real).

Mi recomendación: arranca por **CU2 (texto)** mientras resuelves las
imágenes — un CSV de título+descripción+categoría es mucho más rápido de
armar (hasta generarlo a mano con unos cientos de filas plausibles por
categoría) que conseguir y etiquetar fotos, y ya te deja probar todo el
pipeline (`train_cu2_text.py`, el endpoint, la integración con el
frontend) de punta a punta.

## Cómo correrlo

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Entrenar (requiere red ensanchada o correr esto fuera del sandbox):
python scripts/train_cu2_text.py --csv data/productos_texto.csv
python scripts/train_cu1_image.py --data-dir data/images

# Levantar el servicio:
uvicorn app.main:app --reload --port 8000
```

En el frontend (`.env.local`): `NEXT_PUBLIC_API_URL=http://localhost:8000`.
Con eso, `/admin/productos/nuevo` ya le habla a este servicio en vez de
fallar con un error de red.

## Lo que falta después de entrenar

- Actualizar la fila correspondiente en `modelos_ia` (`estado =
  'en_producción'`, `metricas`, `ruta_artefacto`, `entrenado_en`) — los
  scripts imprimen las métricas y las guardan en un `.json` al lado del
  checkpoint, para copiarlas ahí a mano o con un `UPDATE` manual.
- Azure Blob Storage real (`AZURE_STORAGE_CONNECTION_STRING` en
  `app/config.py`) — sin eso, `storage.py` cae a guardar las fotos en
  disco local, que no sirve para producción.
- Desplegar este servicio en algún lado alcanzable por tu frontend en
  producción (hoy solo corre en `localhost:8000`).
