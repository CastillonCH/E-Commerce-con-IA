# Entrenamiento local de los modelos (Windows + GPU NVIDIA)

Guía para reentrenar los 4 modelos del módulo de IA en una PC con GPU
NVIDIA, pensada para la RTX 4060 de 8 GB que usó el equipo en el PR #5.
Reemplaza el flujo anterior (`entrenar_cu1.py` / `entrenar_cu2_*.py` de
ese PR) con las mejoras explicadas en `docs/MEJORA_MODELOS_IA.md`.

Los scripts se verificaron corriendo de punta a punta en CPU (sin GPU);
los tiempos con GPU que aparecen abajo son **estimaciones**, no
mediciones. Si no tienes GPU, todo corre igual en CPU, solo que mucho más
lento (BETO y las redes de imagen pasan de minutos a horas).

## 0. Requisitos

- Python 3.11, y PyTorch con CUDA (el entorno del PR #5 ya lo tiene:
  PyTorch 2.6 + CUDA 12.4). Si arrancas de cero, en PowerShell:

```powershell
cd ml
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# requirements.txt trae torch para CPU; reemplázalo por la build con CUDA:
pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124 --force-reinstall
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

La última línea debe imprimir `True` y el nombre de tu GPU.

- ~15 GB libres en disco (el pipeline baja ~10 GB de Shopify, pero solo
  guarda las ~6 500 imágenes elegidas, a 512 px como máximo).

## 1. Regenerar el dataset

**Hay que regenerarlo**: el dataset anterior (2 935 productos, solo
Shopify) tenía 11 de las 21 clases con menos de 100 ejemplos y es la
causa principal de las métricas bajas (ver `docs/MEJORA_MODELOS_IA.md`).
Guarda el anterior por si acaso:

```powershell
cd ml
Rename-Item datos datos_anterior   # si existe
.\.venv\Scripts\python.exe preparar_dataset.py
```

Qué hace: lee Shopify (sus dos splits), Fashion Product Images (MIT) y
Amazon Berkeley Objects (CC BY 4.0), elige hasta 500 ejemplos por clase
(Shopify primero, máximo 300 por fuente complementaria), baja solo esas
imágenes, traduce al español lo que haga falta (con caché en
`datos/cache/traducciones.json`) y parte 70/15/15 con semilla 42. Al final
imprime una tabla de ejemplos por clase y por fuente, y la guarda en
`datos/reporte_dataset.json`.

Tiempo estimado: 10-20 minutos con GPU (la traducción usa la GPU si la
hay). En CPU, la lectura y descarga tomó ~6 minutos (medido); la
traducción en CPU tarda bastante más — ver el tiempo medido en
`docs/MEJORA_MODELOS_IA.md`.

## 2. Entrenar

Siempre desde la carpeta `ml`, con el entorno activado. Cada script deja
en `ml/modelos/<codigo>/` el modelo, `metricas.json` (medidas en el
conjunto de PRUEBA), `reporte_por_clase.json`, la matriz de confusión,
las curvas de entrenamiento y un `registro_modelo.sql`.

```powershell
.\.venv\Scripts\python.exe entrenar_cu2_tfidf.py   # baseline de texto
.\.venv\Scripts\python.exe entrenar_cu2_beto.py    # BETO
.\.venv\Scripts\python.exe entrenar_cu1.py         # ResNet-50 + EfficientNet-B0
.\.venv\Scripts\python.exe evaluar_fusion.py       # imagen + texto, segundos
```

Tiempos: los de CPU están medidos en `docs/MEJORA_MODELOS_IA.md`; con
una RTX 4060 se estima que BETO tome del orden de 10-20 minutos y las dos
redes de imagen del orden de 30-60 minutos (estimación, no medición).

Cada script imprime al final si el modelo cumple su meta del T1:

| Modelo | Meta (en test) |
|---|---|
| ResNet-50 / EfficientNet-B0 (CU1) | accuracy ≥ 0.80 y F1-macro ≥ 0.75 |
| BETO (CU2) | F1-macro ≥ 0.85 y mayor que el baseline TF-IDF |

Para probar que todo corre antes de la corrida larga (las métricas de
esta prueba NO valen nada y el exportador se niega a publicar esos
modelos):

```powershell
.\.venv\Scripts\python.exe entrenar_cu2_beto.py --modo-rapido
.\.venv\Scripts\python.exe entrenar_cu1.py --modo-rapido
```

### Si te quedas sin memoria de GPU

`entrenar_cu1.py --batch 16` (por defecto 32) o
`entrenar_cu2_beto.py --batch 8` (por defecto 16).

### Si Windows se queja de los workers del DataLoader

`entrenar_cu1.py --workers 0` (más lento, pero sin procesos hijos).

## 3. Publicar en ai-service

```powershell
.\.venv\Scripts\python.exe exportar_a_ai_service.py
```

Copia cada modelo a `ai-service/models/<codigo>/` con los nombres de
archivo que carga el servicio, escribe `ai-service/models/labels.json`,
y te imprime:

- la lista de `registro_modelo.sql` a correr contra tu PostgreSQL;
- el `PESO_FUSION_IMAGEN` recomendado (elegido en validación por
  `evaluar_fusion.py`) para poner en `ai-service/.env`.

Registrar las métricas en la base (PowerShell, una vez por archivo):

```powershell
psql "postgresql://postgres:TU_PASSWORD@localhost:5432/novastore_db" -f "modelos\cu2-beto-v1\registro_modelo.sql"
```

(o ábrelos y ejecútalos en el Query Tool de pgAdmin).

Después, reinicia `ai-service` y comprueba:

```powershell
curl http://localhost:8000/health
```

Debe decir `"modo": "real"` y listar los modelos cargados. En
`/admin/modelos` (como administrador) verás las métricas reales contra
las metas del T1.

## Por qué no se usan los archivos de la corrida anterior

- Guardaban las clases en orden **alfabético**. `ai-service` (antes de
  este cambio) interpretaba la posición de salida como el `indice_clase`
  de la taxonomía, así que la predicción fusionada caía en categorías
  equivocadas. Ahora los scripts usan el orden de la taxonomía y además
  `ai-service` mapea siempre por nombre, así que ningún orden lo rompe.
- `entrenar_cu1.py` copiaba `resnet50.pt` a `ai-service/app/modelos/`,
  una carpeta que el servicio no lee: seguía en modo demo.
- Se entrenaron sobre el dataset anterior, con otra partición: sus
  métricas no son comparables con las nuevas.
