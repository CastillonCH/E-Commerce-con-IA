# Informe final — Módulo de IA (NovaStore)

Resumen de lo construido en `feature/modulo-ia`, fase por fase, lo que se
verificó y cómo, lo que no se pudo probar en este entorno y por qué, los
cambios de base de datos y qué hacer con ellos, y el checklist exacto de
lo que falta hacer fuera de este repositorio (entrenar en Colab).

**Nada de esto se pushea ni abre un PR todavía** — todo quedó en commits
locales sobre `feature/modulo-ia`, a la espera de que lo pidas
explícitamente.

## Resumen por fase

### Fase 1 — Dataset (`ml/`)

- `ml/mapeo_categorias.py`: mapeo por prefijo de la taxonomía de
  `Shopify/product-catalogue` (Google Product Taxonomy) a las 21
  categorías de NovaStore, verificado contra ~2 400 valores reales y
  únicos de `ground_truth_category` leídos de la API pública de Hugging
  Face (no es un mapeo adivinado — varios prefijos que se habían
  inferido "a ojo" resultaron tener el nombre exacto distinto, y se
  corrigieron tras verificar contra datos reales; el detalle está en
  `ml/DATASET.md`).
- `ml/preparar_dataset.py`: filtra, deduplica, limita por clase, reporta
  conteos por categoría, traduce al español lo que no esté en español
  (`Helsinki-NLP/opus-mt-en-es`, documentado como limitación
  metodológica — una traducción automática no es lo mismo que texto
  nativo en español), y separa 70/15/15 con semilla fija 42.
- `ml/abo_complemento.py`: lógica para complementar categorías flojas
  con Amazon Berkeley Objects (CC BY 4.0) — **escrita pero no ejecutada
  de punta a punta en este sandbox** (los archivos de ABO pesan varios
  GB; no se descargaron aquí). Queda lista para usarse si al correr el
  dataset completo alguna categoría necesita más ejemplos.
- `ml/DATASET.md`: fuentes, licencias, conteos esperados, y las
  limitaciones de arriba, documentadas explícitamente.

Commit: `ia fase 1: preparación del dataset (ml/)`.

### Fase 2 — Notebooks de Colab (`ml/notebooks/`)

4 notebooks generados con `ml/_build_notebooks.py` (un script Python que
construye los `.ipynb` con `nbformat`, en vez de escribir JSON a mano —
así quedan reproducibles si hay que ajustar algo):

1. `00_preparar_dataset.ipynb` — monta Drive, descarga y prepara el
   dataset, guarda la partición 70/15/15 en Drive para que los otros 3
   notebooks la reutilicen.
2. `01_cu2_baseline_tfidf.ipynb` — TF-IDF + Regresión logística (el piso
   de comparación para CU2).
3. `02_cu2_beto.ipynb` — fine-tuning de BETO (CU2 real).
4. `03_cu1_imagen.ipynb` — ResNet-50 + EfficientNet-B0 + fusión
   imagen+texto (CU1 real).

Cada uno tiene: montaje de Drive, un interruptor `MODO_RAPIDO`, semillas
fijas, celdas de texto en español explicando cada paso, y al final
guarda el modelo + `metricas.json` + matriz de confusión (+ curvas de
entrenamiento en 02 y 03) + un `registro_modelo.sql` listo para pegar en
PostgreSQL.

**Verificación real hecha en este sandbox:** los 4 notebooks se
ejecutaron de punta a punta localmente con `nbconvert`, en
`MODO_RAPIDO=True` (datos sintéticos minúsculos, 1 época, CPU) — **esto
confirma que cada notebook corre sin errores de código de principio a
fin**, no que los modelos sirvan para nada. Las métricas que salieron de
esas corridas (accuracy/F1 con 5 ejemplos por clase y 1 época) **no
están guardadas ni citadas en ningún lado como resultado real** — fueron
descartadas apenas se confirmó que el notebook terminaba sin errores.
Lo que no se pudo probar en este sandbox, porque necesita GPU y tiempo
de Colab reales: el entrenamiento completo (`MODO_RAPIDO=False`) sobre
el dataset de verdad, y por lo tanto las métricas reales de accuracy/F1
que exige el proyecto. Eso queda para que lo corras tú en Colab — ver
`docs/GUIA_COLAB.md`.

Commit: `ia fase 2: notebooks de Colab (CU1, CU2, fusión) + verificación local`.

### Fase 3 — Microservicio de IA (`ai-service/`)

Reescrito como el microservicio real que pide el proyecto: FastAPI con
patrón factory (`crear_app(models_dir)`, para que los tests de pytest
puedan aislar cada caso con artefactos propios), `GET /health`,
`GET /modelos`, `POST /clasificar` con el contrato exacto documentado en
`docs/ARQUITECTURA_IA.md`. Carga lo que encuentre en `MODELS_DIR` al
arrancar (valida `labels.json` contra la taxonomía si existe); si no
encuentra nada, arranca en **modo demostración** (reglas de palabras
clave + "embeddings" deterministas por hash — nunca presentados como
reales). Límites de 5 MB / PNG-JPG-WEBP en la imagen.

**Verificado:** 16 tests de pytest, todos en modo demo (sin descargar ni
entrenar ningún modelo real) — incluye un test que genera artefactos
diminutos dentro del propio test para probar que `app/modelos/registro.py`
realmente carga un checkpoint, no solo que no explota si no hay ninguno.

Commit: `ia fase 3: microservicio de IA completo (FastAPI, modo real/demo)`.

### Fase 4 — Integración con Next.js

Conecta todo lo anterior al flujo real de la tienda:

- `lib/ai-client.ts` (cliente server-only, Zod, timeout 20s) y
  `lib/storage.ts` (guarda la foto — Azure Blob o `public/uploads/`
  local) reemplazan el contrato roto que llamaba a un backend que no
  existía (`lib/api.ts`, eliminado).
- Alta y edición de producto: campos de descripción y categoría del
  vendedor; reemplazar la foto al editar dispara una nueva
  clasificación; `AISuggestionPanel` muestra categoría, confianza,
  top-3, si coincide con la categoría elegida, y el aviso de modo
  demostración cuando corresponde.
- `accuracy` → `confidence` en todo el código (nombre correcto de lo
  que realmente devuelve el modelo).
- Persistencia por modelo en `predicciones_ia`/`producto_embeddings`
  **solo en modo real** — en modo demo no hay fila de `modelos_ia` para
  el código `"demo"`, así que no hay FK válida para esas tablas
  (detallado en `docs/ARQUITECTURA_IA.md`).
- `REVIEW_POLICY` (`"todos"` por defecto, o `"umbral"`) +
  `REVIEW_THRESHOLD`, configurables por entorno; `/admin/revision`
  registra `tiempo_revision_seg`.
- CU5 real: `fn_buscar_duplicados` (pgvector) sobre los embeddings
  guardados, con `/admin/duplicados` mostrando los pares a
  confirmar/descartar; Levenshtein queda solo como respaldo
  explícitamente etiquetado cuando no hay embeddings.
- `/admin/modelos` (solo ADMIN): salud del servicio, tabla de
  `modelos_ia` vs. las metas del T1, las 3 vistas de métricas, y export
  CSV de `v_dataset_entrenamiento`.
- Tests: Vitest (`lib/ai-client.test.ts` con fetch mockeado;
  `lib/data/products-repo.test.ts` ampliado con los nuevos casos contra
  Postgres real) y Playwright E2E (`tests/e2e/mock-ai-service.mjs`, un
  mock en Node del servicio de IA en modo demo vía `webServer`; flujo
  completo alta → sugerencia → revisión → publicado; flujo con el
  servicio caído). Nuevo job de CI (`ai-service` en `.github/workflows/ci.yml`)
  que corre pytest en modo demo.

**Dos bugs reales encontrados y corregidos durante la verificación E2E**
(no hipotéticos — aparecieron corriendo los tests contra Postgres real,
no al leer el código):

1. `producto_imagenes.url` exigía `https://` a secas. En desarrollo
   local sin Azure Blob configurado, `lib/storage.ts` guarda la foto en
   `public/uploads/` y la URL es `http://localhost:3000/...` — nunca
   iba a cumplir un CHECK que solo acepta `https://`. Arreglado en dos
   partes: `lib/storage.ts` ahora arma una URL **absoluta** con
   `APP_CONFIG.siteUrl` (antes devolvía una ruta relativa, que tampoco
   cumplía ni con `https://` ni con `http://`), y la restricción se
   relajó a `^https?://` vía migración (ver abajo). Sin la URL absoluta,
   el relajar la restricción no alcanzaba — las dos partes eran
   necesarias.
2. Al aprobar una ficha sin predicción persistida (modo demo, o
   cualquier producto sin fila en `predicciones_ia`), el `<select>` de
   categoría final en `/admin/revision` mostraba una opción
   visualmente (el navegador cae a la primera opción de la lista cuando
   el `defaultValue` no matchea ninguna) pero el estado de React nunca
   se actualizaba (un `defaultValue` que no matchea ninguna opción no
   dispara `onChange`) — "Aprobar" fallaba siempre con el error "este
   producto no tiene una categoría sugerida ni una categoría final".
   `ReviewQueue.tsx` ahora calcula, al aprobar, el mismo valor por
   defecto que el navegador le muestra al administrador, para que lo
   que se envía siempre coincida con lo que se ve en pantalla.

También se encontró, y se corrigió en el propio test, una premisa
equivocada en el E2E: el botón "Ir a Revisión de IA" que ve el vendedor
no lo puede abrir el vendedor mismo — `proxy.ts` ya protegía
`/admin/revision` como ruta solo-ADMIN desde antes de este módulo
(defensa en profundidad, lista en `ADMIN_ONLY_PATHS`), y eso es
correcto: un vendedor nunca revisa su propia ficha, solo un
administrador. El test se ajustó para reflejar eso, no se tocó el
comportamiento de la app.

Como limpieza relacionada: `NEXT_PUBLIC_API_URL` y el `apiUrl` de
`APP_CONFIG` (restos del contrato roto que usaba `lib/api.ts`) se
quitaron de `lib/config.ts`, `lib/env.client.ts`, `next.config.ts` (la
`Content-Security-Policy` ya no necesita permitir una URL configurable
que nadie usa) y `.env.example`; se agregaron ahí mismo las variables
nuevas (`AI_SERVICE_URL`, `AI_API_KEY`, `REVIEW_POLICY`,
`REVIEW_THRESHOLD`, `AZURE_STORAGE_CONNECTION_STRING`,
`AZURE_BLOB_HOSTNAME`) que antes no estaban documentadas ahí.

Commit: `ia fase 4: integración del módulo de IA en Next.js`.

### Fase 5 — Documentación (este commit)

- `docs/ARQUITECTURA_IA.md`: diagrama (Mermaid), el contrato
  `POST /clasificar` con ejemplo real de respuesta, y las decisiones de
  diseño explicadas con su por qué (modo demo que no persiste nada,
  política de revisión, CU5 sobre embeddings vs. Levenshtein, por qué
  las fotos las guarda Next y no `ai-service`, por qué el servicio no
  entrena).
- `docs/GUIA_COLAB.md`: guía paso a paso en español para alguien que
  nunca usó Colab — abrir los notebooks, montar Drive, entender
  `MODO_RAPIDO`, correr los 4 en orden, y el paso más delicado: copiar
  exactamente lo que generan a `ai-service/models/` (con el detalle de
  qué hay que renombrar para el notebook de imagen, que entrena dos
  arquitecturas en una sola carpeta), correr cada `registro_modelo.sql`
  contra Postgres (pgAdmin o `psql`, con comandos de PowerShell), marcar
  un modelo `en_produccion`, y verificar que `/admin/modelos` deje de
  mostrar "modo demostración".
- `Leer.md`: actualizado para reflejar el contrato real (ya no
  `lib/api.ts`/`NEXT_PUBLIC_API_URL`), con instrucciones de Windows
  (PowerShell) para las 3 piezas (PostgreSQL, Next.js, `ai-service/`),
  las variables de entorno nuevas, la sección de migraciones, y los
  límites conocidos actualizados.
- Este archivo.

## Verificación — qué se corrió y qué dio

| Comando | Resultado |
|---|---|
| `npm run lint` | Sin errores |
| `npx tsc --noEmit` | Sin errores |
| `npm run build` | Build de producción exitoso (Turbopack) |
| `npx playwright test` | **29/29** (incluye los 2 flujos nuevos de alta con IA: feliz y servicio caído) |
| `pytest` (`ai-service/`) | **16/16**, modo demo |
| `npm test` (Vitest) | **94/103** — ver nota abajo |

**Nota sobre los 9 tests de Vitest que fallan en este entorno de
verificación:** los 9 fallan exactamente con el mismo error,
`relation "producto_embeddings" does not exist`, porque este sandbox no
tiene acceso a un espejo de `apt` para instalar la extensión `vector` de
PostgreSQL por fuera de una imagen Docker con pgvector ya incluido. No
son fallas de lógica — son el límite conocido de este entorno de
verificación, confirmado corriendo el mismo esquema (con la extensión
`vector` y las tablas que dependen de ella quitadas temporalmente de una
**copia**, nunca del archivo real) contra un Postgres real local. El CI
de GitHub Actions (`.github/workflows/ci.yml`) usa la imagen
`pgvector/pgvector:pg16`, que sí trae la extensión, así que ahí corren
los 103 tests completos — eso no se pudo confirmar ejecutándolo en este
sandbox (no hay acceso a GitHub Actions desde aquí), pero el workflow no
cambió su forma de cargar el esquema, solo se le agregó el job nuevo de
`ai-service`.

## Migraciones de base de datos

Una sola, y con una razón concreta encontrada durante la verificación
(no preventiva): **`db/migraciones/001_permitir_http_en_producto_imagenes.sql`**.

- **Qué hace:** relaja `producto_imagenes.url_check` de exigir
  `https://` a aceptar también `http://`.
- **Por qué fue necesaria:** `lib/storage.ts` (nuevo en esta fase) guarda
  la foto del producto en `public/uploads/` cuando no hay Azure Blob
  configurado (el fallback de desarrollo local que pide la
  especificación) — y esa URL es `http://`, no `https://`. Se encontró
  corriendo el E2E de alta de producto contra Postgres real, no es
  hipotético.
- **Por qué no rompe nada en producción:** Azure Blob Storage siempre da
  URLs `https://` — la migración solo agrega una opción que antes no
  existía, nunca quita la que ya funcionaba.
- **Qué tienes que hacer tú:** si ya tenías la base de datos cargada
  *antes* de este módulo de IA, corre esa migración una vez (ver
  `Leer.md`, sección "Migraciones de base de datos", con el comando
  exacto de PowerShell). Si vas a cargar la base desde cero con
  `db/novastore_postgresql.sql`, no necesitas hacer nada — el script
  completo ya incluye el cambio.

No se tocó nada más del esquema. Todo lo demás que este módulo necesitaba
(`categoria_vendedor_id`, `modelos_ia`, `predicciones_ia`,
`producto_embeddings`, `duplicados_detectados`, `fn_buscar_duplicados`,
las 3 vistas de métricas) ya estaba en `db/novastore_postgresql.sql`
desde antes de empezar — se confirmó por inspección directa del esquema
antes de escribir una sola línea de `lib/data/products-repo.ts`.

## Pendientes y riesgos

- **Ningún modelo está entrenado todavía.** Esto es esperado — el plan
  siempre fue que tú entrenes en Colab con GPU gratuita. Hasta que lo
  hagas, todo corre en modo demostración, siempre declarado como tal.
  Checklist exacto abajo.
- **`ml/abo_complemento.py` no se ejecutó de punta a punta.** La lógica
  está escrita y documentada, pero nunca se corrió contra los datos
  reales de Amazon Berkeley Objects en este sandbox (pesan varios GB).
  Solo revísalo con cuidado la primera vez que lo actives, si alguna
  categoría queda floja después de correr el dataset completo.
- **El entrenamiento real (GPU, dataset completo) no se corrió en
  ningún lado todavía** — ni en este sandbox (no tiene GPU) ni en Colab
  (no tengo acceso a tu cuenta de Google). Las únicas corridas que se
  hicieron fueron de verificación (`MODO_RAPIDO=True`, datos sintéticos
  mínimos), explícitamente para confirmar que el código no tiene errores,
  nunca como métricas válidas.
- **El job nuevo de CI (`ai-service` en `.github/workflows/ci.yml`) no
  se corrió dentro de GitHub Actions** — se verificó que el YAML es
  válido y que el mismo comando (`pip install` + `pytest`) funciona en
  este sandbox; la primera corrida real de ese job será cuando hagas
  push y se dispare el workflow.
- **El complemento de ABO, y el entrenamiento real en Colab, quedan
  bajo tu control** — son los dos puntos donde este trabajo
  deliberadamente se detiene y te pasa la posta, como pediste.

## Lo que te toca a ti (checklist)

1. **Entrenar en Colab** (gratis, con GPU T4) — sigue
   `docs/GUIA_COLAB.md` de punta a punta:
   - Sube y corre, en orden, los 4 notebooks de `ml/notebooks/` con
     `MODO_RAPIDO=False`.
   - Cada uno te deja en tu Google Drive el modelo entrenado,
     `metricas.json`, gráficos, y uno o más `registro_modelo.sql`.
2. **Copiar los artefactos** de tu Drive a `ai-service/models/`,
   respetando la estructura exacta de carpetas (la guía trae los
   comandos de PowerShell, incluyendo el renombrado que necesita el
   notebook de imagen).
3. **Correr cada `registro_modelo.sql`** contra tu base de datos
   (pgAdmin o `psql` — ambos en la guía) para que `modelos_ia` quede
   con las métricas reales.
4. **Marcar como `en_produccion`** el/los modelo(s) que decidas usar,
   una vez que revisaste que las métricas cumplen las metas del T1
   (CU1: accuracy ≥ 80%, F1-macro ≥ 75%; CU2: F1-macro ≥ 85% y superar
   al baseline de TF-IDF; CU5: precisión ≥ 90% sobre pares verificados
   a mano).
5. **Si ya tenías la base de datos cargada**, corre la migración
   `db/migraciones/001_permitir_http_en_producto_imagenes.sql` una vez.
6. **Levantar `ai-service`** con esos modelos copiados, y confirmar en
   `/admin/modelos` (como administrador) que ya no diga "modo
   demostración" y que las métricas que se muestren sean las reales que
   acabas de registrar.
7. **Decidir `REVIEW_POLICY`** para tu entorno: `"todos"` (por defecto,
   un humano siempre confirma) o `"umbral"` (publica directo si la
   confianza es alta) — es una decisión de producto, no algo que este
   trabajo deba decidir por ti.
8. **Cuando quieras, pide el push/PR** — por ahora todo quedó en commits
   locales sobre `feature/modulo-ia`, como pediste.
