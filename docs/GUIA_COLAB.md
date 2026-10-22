# Guía: entrenar los modelos en Google Colab

Esta guía es para quien nunca usó Google Colab. Entrenar los 4 modelos
(CU1 imagen ×2, CU2 texto ×2) toma, en total, un par de horas de GPU T4
gratuita — no hace falta pagar Colab Pro, pero sí una cuenta de Google.

No vas a programar nada acá: los notebooks ya están escritos
(`ml/notebooks/`). Solo tienes que abrirlos, correrlos de arriba a abajo,
y al final copiar lo que generaron a tu máquina.

> Si tienes una PC con GPU NVIDIA, es más simple entrenar ahí sin Colab:
> ver `docs/ENTRENAMIENTO_LOCAL.md`. Los notebooks 01-03 corren
> exactamente los mismos scripts (`ml/entrenar_*.py`), así que el
> resultado es el mismo por cualquiera de los dos caminos.
>
> Sube a Drive la carpeta `ml/` completa del repositorio (los notebooks
> necesitan los scripts que están ahí), en `MyDrive/NovaStore_IA/ml/`.

## 0. Antes de empezar

- Necesitas una cuenta de Google (Gmail alcanza) con algo de espacio
  libre en Google Drive (unos 2-3 GB para el dataset + los modelos).
- Los 4 notebooks están en `ml/notebooks/` de este repositorio:
  - `00_preparar_dataset.ipynb`
  - `01_cu2_baseline_tfidf.ipynb`
  - `02_cu2_beto.ipynb`
  - `03_cu1_imagen.ipynb`
- **Corre los 4 en ese orden exacto.** El 00 arma el dataset y lo
  guarda en tu Drive; los otros 3 leen esa misma partición — si te
  saltas el 00, los demás fallan al no encontrar los archivos.

## 1. Subir y abrir un notebook en Colab

1. Entra a [colab.research.google.com](https://colab.research.google.com)
   con tu cuenta de Google.
2. `Archivo` → `Subir notebook` → sube `ml/notebooks/00_preparar_dataset.ipynb`
   desde tu computadora (o súbelo primero a tu Drive y ábrelo desde ahí,
   lo que te sea más cómodo).
3. Arriba a la derecha, donde dice el tipo de entorno de ejecución:
   `Entorno de ejecución` → `Cambiar tipo de entorno de ejecución` →
   elige **GPU** (T4) → Guardar. (El notebook 00 no necesita GPU, pero
   02 y 03 sí — puedes dejarla activada desde ahora para los 4.)

## 2. Montar Google Drive

La primera celda de cada notebook monta tu Drive:

```python
from google.colab import drive
drive.mount("/content/drive")
```

Al correrla (Shift+Enter, o el botón ▶ a la izquierda de la celda), Colab
te va a pedir autorizar el acceso — sigue el enlace, elige tu cuenta,
acepta. Todo lo que generen los notebooks se guarda en
`/content/drive/MyDrive/NovaStore_IA/` dentro de tu Drive, así que si se
desconecta la sesión de Colab (pasa después de un rato de inactividad,
o a las ~12h) no pierdes nada — puedes volver a montar Drive y seguir
donde quedaste.

## 3. `MODO_RAPIDO`: entiende este interruptor antes de tocar nada

Cerca del inicio de cada notebook vas a ver:

```python
MODO_RAPIDO = False
```

- **`False` (por defecto) = entrenamiento real**, con el dataset
  completo y las épocas que corresponden. Esto es lo que quieres dejar
  para que el modelo sirva de verdad.
- **`True` = una corrida de prueba**, con un puñado de ejemplos y 1 sola
  época, pensada solo para confirmar que el notebook corre de punta a
  punta sin errores (de hecho, así se verificó cada notebook durante el
  desarrollo de este módulo — ver `docs/INFORME_IA.md`). **Las métricas
  que salen con `MODO_RAPIDO=True` no significan nada** — no las
  anotes, no las compares con las metas del proyecto.

Déjalo en `False` para el entrenamiento real. Si en algún momento un
notebook te da un error raro y no sabes si es tuyo o del notebook,
puedes poner `MODO_RAPIDO=True` por un momento para descartar que sea
un problema de datos/dataset (corre en minutos) antes de volver a
`False`.

## 4. Correr cada notebook

En Colab: `Entorno de ejecución` → `Ejecutar todas` corre el notebook
completo de arriba a abajo. Si prefieres ir celda por celda para leer
las explicaciones en el camino (cada notebook tiene celdas de texto en
español explicando qué hace cada paso), usa Shift+Enter en cada una.

### 00 — Preparar el dataset

Arma el dataset con Shopify/product-catalogue más dos fuentes
complementarias de licencia abierta para las clases que Shopify casi no
tiene (ver `ml/DATASET.md`), traduce al español lo que haga falta,
separa en entrenamiento/validación/prueba (70/15/15, semilla fija), y
guarda todo en tu Drive. Tiempo estimado: 15-30 minutos.

### 01 — Baseline de CU2 (TF-IDF + Regresión logística)

Rápido (unos minutos, no necesita GPU). Es el piso de comparación:
BETO (notebook 02) tiene que superarlo, si no, no vale la pena usar un
modelo más caro.

### 02 — CU2: fine-tuning de BETO

Ajusta BETO (un BERT en español) a las 21 categorías. Tiempo estimado
con GPU T4: 15-30 minutos. Meta del proyecto: F1-macro ≥ 0.85 en el
conjunto de prueba, y superar al baseline del notebook 01.

### 03 — CU1: ResNet-50 + EfficientNet-B0 (imagen) y fusión

El más largo: entrena dos arquitecturas de imagen y después evalúa la
fusión imagen+texto (necesita que ya hayas corrido 01 y/o 02). Tiempo
estimado con GPU T4: 45-90 minutos. Meta del proyecto: accuracy ≥ 0.80 y
F1-macro ≥ 0.75 en el conjunto de prueba.

Si Colab te desconecta a la mitad, vuelve a conectar, corre otra vez las
celdas: los notebooks 02 y 03 llaman a los scripts con `--reanudar`, que
retoman desde la última época terminada (el estado se guarda en Drive en
cada época como `estado_entrenamiento.pt` y se borra al terminar). En el
03, si ResNet-50 ya había terminado y el corte fue en EfficientNet-B0,
cambia la celda a `python entrenar_cu1.py --arquitecturas efficientnet_b0
--reanudar` para no reentrenar la que ya está lista.

## 5. Qué te queda al final de cada notebook

Cada notebook deja todo dentro de tu Drive, en
`NovaStore_IA/ml/modelos/<algo>/`:

- El/los archivo(s) del modelo entrenado.
- `metricas.json` — accuracy, F1-macro, y el resto de lo que mide el
  notebook sobre el conjunto de **prueba** (nunca inventado — si no se
  pudo calcular algo, el campo no está).
- `matriz_confusion.png` (y `curvas_entrenamiento.png` en 02 y 03).
- Un `registro_modelo.sql` — un `UPDATE` listo para pegar en tu base de
  datos (ver el paso 7).

Concretamente, según el notebook (una carpeta por `modelos_ia.codigo`,
con los mismos nombres de archivo que carga `ai-service`):

| Notebook | Carpeta en Drive | Modelo |
|---|---|---|
| 01 | `ml/modelos/cu2-tfidf-logreg-v1/` | `pipeline.joblib` |
| 02 | `ml/modelos/cu2-beto-v1/` | carpeta completa de `save_pretrained` (`config.json`, `model.safetensors`, tokenizer…) |
| 03 | `ml/modelos/cu1-resnet50-v1/` y `ml/modelos/cu1-efficientnet-b0-v1/` | `modelo.pt` en cada una |
| 03 (fusión) | `ml/modelos/fusion/` | `metricas_fusion.json` con el `PESO_FUSION_IMAGEN` recomendado |

## 6. Descargar de Drive y copiar a `ai-service/models/`

`ai-service` espera una estructura **específica** (ver
`ai-service/app/modelos/registro.py` y `ai-service/README.md`):

```
ai-service/models/
  cu1-resnet50-v1/
    modelo.pt
    metricas.json
  cu1-efficientnet-b0-v1/
    modelo.pt
    metricas.json
  cu2-beto-v1/
    config.json, model.safetensors, tokenizer.json, ...
    metricas.json
  cu2-tfidf-logreg-v1/
    pipeline.joblib
    metricas.json
```

Descarga la carpeta `NovaStore_IA/ml/modelos/` entera desde Google Drive
(clic derecho sobre la carpeta → Descargar — Drive la empaqueta en un
.zip) y descomprímela **dentro de la carpeta `ml/` del proyecto**, de
modo que quede `ml\modelos\cu2-beto-v1\...`, etc. Después, desde `ml`:

```powershell
.\.venv\Scripts\python.exe exportar_a_ai_service.py
```

Copia cada modelo a `ai-service\models\<codigo>\` con los nombres que
espera el servicio (no hay que renombrar nada a mano), se niega a
publicar modelos entrenados con `MODO_RAPIDO=True`, y te imprime los
`registro_modelo.sql` a correr y el `PESO_FUSION_IMAGEN` recomendado para
`ai-service\.env`.

No necesitas copiar los 4 modelos a la vez — `ai-service` carga lo que
encuentre. Si solo entrenaste CU2 por ahora, cópialo igual y el servicio
va a quedar en modo real para texto y seguir en modo demo para imagen
(y lo va a decir así en `/health` y en `/admin/modelos`).

Después de copiar, levanta (o reinicia, si ya estaba corriendo)
`ai-service` — ver `ai-service/README.md` — y confirma en
`http://localhost:8000/health` que `"modo"` diga `"real"` y que
`"modelos_cargados"` liste los códigos que copiaste.

## 7. Registrar el modelo en tu base de datos

Cada `registro_modelo.sql` es un `UPDATE` sobre `novastore.modelos_ia`
que guarda las métricas reales, cambia el estado a `'evaluado'`, y anota
la ruta del artefacto. Ejemplo real de lo que trae (los números van a
ser los que te salgan a ti):

```sql
UPDATE novastore.modelos_ia
   SET metricas = '{"accuracy": 0.87, "f1_macro": 0.84}'::jsonb,
       hiperparametros = hiperparametros || '{"ngram_range": [1, 2], "max_features": 20000}'::jsonb,
       estado = 'evaluado',
       entrenado_en = now(),
       ruta_artefacto = 'cu2-tfidf-logreg-v1/pipeline.joblib'
 WHERE codigo = 'cu2-tfidf-logreg-v1';
```

Tienes dos formas de correrlo contra tu base de datos local
(`novastore_db`, o el nombre que le hayas puesto):

**Con pgAdmin** (interfaz gráfica):

1. Abre pgAdmin, conéctate a tu servidor de PostgreSQL local.
2. Haz clic derecho sobre la base → `Query Tool`.
3. Abre el archivo `registro_modelo.sql` que descargaste (icono de
   carpeta en la barra del Query Tool, o pega el contenido directo).
4. Ejecuta (▶ o F5).
5. Repite por cada `registro_modelo.sql` que tengas (hasta 5: uno por
   01, uno por 02, dos por 03).

**Con `psql`, en PowerShell:**

```powershell
psql "postgresql://postgres:TU_PASSWORD@localhost:5432/novastore_db" `
  -f "C:\ruta\a\registro_modelo.sql"
```

(Si `psql` no se reconoce como comando, usa la ruta completa al
ejecutable, algo como
`"C:\Program Files\PostgreSQL\16\bin\psql.exe"`, o agrega esa carpeta a
tu `PATH`.)

## 8. Marcar el modelo como `en_produccion`

El `UPDATE` del paso anterior deja el modelo en estado `'evaluado'` —
todavía no es el que usa el servicio para decidir nada en producción
(eso es solo un rótulo informativo en la tabla; `ai-service` carga el
archivo igual, el estado es para que tú y tu equipo sepan cuál es "el
bueno" cuando entrenen varias versiones). Una vez que revisaste las
métricas y decidiste que ese modelo es el que quieres usar:

```sql
UPDATE novastore.modelos_ia
   SET estado = 'en_produccion'
 WHERE codigo = 'cu2-tfidf-logreg-v1';
```

(Cambia el `codigo` por el que corresponda, y repite por cada modelo que
decidas poner en producción.)

## 9. Verificar que `/admin/modelos` muestra "real"

1. Con `ai-service` corriendo y los artefactos copiados (paso 6),
   levanta el frontend (`npm run dev`) con `AI_SERVICE_URL` apuntando a
   tu `ai-service` local en `.env.local` (ver `Leer.md`).
2. Entra como administrador (`/admin/login`) y ve a `/admin/modelos`.
3. Ahí deberías ver:
   - El indicador de salud del servicio **sin** el aviso de "modo
     demostración".
   - Cada modelo que copiaste y registraste, con sus métricas reales
     (no en blanco, no con datos de ejemplo) y comparadas contra las
     metas del T1.
4. Da de alta un producto de prueba desde `/admin/productos/nuevo`: el
   panel de sugerencia ya no debería decir "Modo demostración" — debería
   mostrarte la categoría, confianza y top-3 que calculó tu modelo real.

Si `/admin/modelos` sigue mostrando modo demo después de todo esto,
revisa en este orden: que `ai-service` esté efectivamente corriendo en
la URL que dice `AI_SERVICE_URL`, que `http://localhost:8000/health`
(o el puerto que uses) ya diga `"modo": "real"` por sí solo, y que la
carpeta copiada en `ai-service/models/` tenga exactamente los nombres
de archivo de la tabla del paso 6 (`modelo.pt`, no `resnet50.pt`, por
ejemplo — es el error más común en este paso).
