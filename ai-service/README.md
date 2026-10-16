# NovaStore — Módulo de IA (CU1, CU2, CU5)

Microservicio FastAPI que clasifica productos por imagen (CU1) y por
texto (CU2), fusiona ambas señales en una sola predicción, y expone los
embeddings que usa CU5 (detección de duplicados). Es el "Módulo de IA
(PyTorch + Hugging Face)" de la plataforma del T1 — el único punto de
todo el proyecto que sigue siendo un servicio Python aparte de Next.js.

No entrena nada: los modelos se entrenan en Google Colab
(`ml/notebooks/`, ver `docs/GUIA_COLAB.md`) y este servicio solo carga
los artefactos ya entrenados desde `MODELS_DIR`. Si no hay ningún
artefacto, arranca igual en **modo demo** (reglas de palabras clave, sin
pretender ser un modelo real — ver `app/modelos/demo.py`).

## Instalar y correr (Windows, PowerShell)

```powershell
cd ai-service
python -m venv .venv
.venv\Scripts\Activate.ps1

# PyTorch para CPU (sin CUDA) — más chico y no necesita GPU en tu máquina:
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

pip install -r requirements.txt

copy .env.example .env
# Edita .env si vas a usar AI_API_KEY (debe coincidir con el .env.local del frontend)

uvicorn app.main:app --reload --port 8000
```

Abre http://localhost:8000/health — si no copiaste ningún modelo todavía
a `models/`, debe responder `{"estado":"ok","modo":"demo",...}`.

### macOS/Linux, para referencia

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Estructura esperada de `models/`

Ver `docs/GUIA_COLAB.md` para cómo copiar exactamente esto desde lo que
guardan los notebooks en Google Drive.

```
models/
  labels.json                      # opcional — se valida contra app/config.py
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

El servicio carga lo que encuentre: puedes tener solo CU2 (texto) sin
CU1 (imagen), o viceversa — cada modelo faltante simplemente no aparece
en `por_modelo` de la respuesta de `/clasificar`. Si no hay NADA, modo
demo.

## Endpoints

| Método y ruta | Auth | Qué hace |
|---|---|---|
| `GET /health` | No | `{estado, modo: "real"\|"demo", modelos_cargados}` |
| `GET /modelos` | `X-API-Key` | Código, arquitectura y métricas (de `metricas.json`) de cada uno de los 4 modelos, y si está cargado |
| `POST /clasificar` | `X-API-Key` | multipart: `imagen` (archivo, obligatorio), `titulo` (obligatorio), `descripcion` (opcional) → predicción fusionada + detalle por modelo + embeddings |

`/health` queda sin autenticación a propósito (para que un balanceador o
un monitor externo lo pueda pingear sin credenciales); `/modelos` y
`/clasificar` si `AI_API_KEY` está seteada en `.env`, exigen el header
`X-API-Key` con ese mismo valor — si no coincide, 401.

### Ejemplo de `POST /clasificar`

```json
{
  "modo": "real",
  "latencia_ms": 340,
  "resultado": {
    "indice_clase": 0,
    "categoria": "Audio y audífonos",
    "confianza": 0.91,
    "top_k": [{"indice_clase": 0, "categoria": "Audio y audífonos", "prob": 0.91}, ...]
  },
  "por_modelo": [
    {"codigo_modelo": "cu1-resnet50-v1", "tipo": "imagen", "indice_clase": 0, "categoria": "Audio y audífonos", "confianza": 0.88, "top_k": [...]},
    {"codigo_modelo": "cu2-beto-v1", "tipo": "texto", "indice_clase": 0, "categoria": "Audio y audífonos", "confianza": 0.95, "top_k": [...]}
  ],
  "embeddings": [
    {"codigo_modelo": "cu1-resnet50-v1", "fuente": "imagen", "vector": [...]},
    {"codigo_modelo": "cu2-beto-v1", "fuente": "texto", "vector": [...]}
  ]
}
```

## Límites

- Imagen: máximo 5 MB, solo PNG/JPG/WEBP (`413`/`415` si no cumple).
- Inferencia en CPU — no necesita GPU para servir (solo para entrenar,
  que pasa en Colab, no acá).
- No guarda la imagen en ningún lado: eso ahora lo hace Next.js (ver
  `lib/ai-client.ts` y `app/admin/(protected)/productos/actions.ts` en
  el frontend) — este servicio solo clasifica, no es dueño del archivo.

## Pruebas

```powershell
pytest
```

Todas corren en **modo demo** (no requieren descargar ni entrenar
ningún modelo real): `tests/test_salud.py` (health, modo demo por
defecto), `tests/test_autenticacion.py` (401 sin API key cuando está
configurada), `tests/test_clasificar.py` (forma de la respuesta, top_k
ordenado descendente, probabilidades que suman ~1), y
`tests/test_registro.py` (carga real de artefactos diminutos generados
dentro del propio test — valida que `app/modelos/registro.py` encuentra
y carga un checkpoint de verdad, sin necesitar un modelo entrenado de
producción).

## Docker (opcional)

```powershell
docker build -t novastore-ia .
docker run -p 8000:8000 --env-file .env -v ${PWD}/models:/app/models novastore-ia
```
