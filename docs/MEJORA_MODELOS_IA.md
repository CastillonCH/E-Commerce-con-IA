# Mejora de los modelos de IA (CU1, CU2) — diagnóstico, cambios y resultados

Punto de partida: la corrida local del PR #5 (RTX 4060), con estas
métricas en test (`RESUMEN_EXPOSICION_IA.txt`):

| Modelo | Accuracy | F1-macro | Meta T1 | Estado |
|---|---:|---:|---|---|
| ResNet-50 | 66.2% | 64.2% | Acc ≥ 80% y F1 ≥ 75% | no cumple |
| EfficientNet-B0 | 59.2% | 47.1% | Acc ≥ 80% y F1 ≥ 75% | no cumple |
| TF-IDF + LogReg (baseline) | 67.8% | 65.8% | — (piso de comparación) | — |
| BETO | 61.0% | 36.2% | F1 ≥ 85% y > baseline | no cumple (peor que el baseline) |
| Fusión ResNet-50 + BETO | 68.7% | 65.6% | — | — |

## 1. Diagnóstico

### 1.1 Causa principal: datos (no hiperparámetros)

Se reprodujo exactamente el dataset de esa corrida contando el mapeo
actual sobre los 48 289 productos de Shopify: 2 935 productos, **11 de
21 clases con menos de 100 ejemplos** (Relojes 10, Peluches 15, Bloques
18, Balones 21, Fragancias 21, Polos 41, …). Con 15% para test, esas
clases tenían 2-3 ejemplos de prueba. El F1-macro promedia las 21 clases
por igual, así que esas clases "de 2 ejemplos" pesan lo mismo que
Muebles con 45, y basta fallar 1-2 productos para hundir el promedio.

Experimento de control (texto en inglés original, solo Shopify): el
baseline del PR #5 reproducido da **68.5% / 68.8%**; con mejores features
(palabras + caracteres) sube a **82.7% / 74.3%** sin cambiar los datos;
y sumar MÁS datos de las clases que ya son grandes sube la accuracy pero
NO el F1-macro. Conclusión: el techo del F1-macro lo ponen las clases
chicas, y en Shopify esos productos casi no existen (contando el dataset
entero: Relojes 15, Peluches 18, Fragancias 23, Balones 25, Bloques 27).

### 1.2 Problemas de entrenamiento

- **BETO** (F1 0.36 con accuracy 0.61 = predice casi solo las clases
  grandes): 4 épocas con lr 2e-5 sobre ~2 000 ejemplos y 21 clases no
  alcanzan para que la cabeza clasificadora (inicializada al azar)
  aprenda las clases chicas; sin pesos por clase, sin clipping.
- **EfficientNet-B0** (F1 0.47): en la fase de fine-tuning solo se
  descongelaba `features.8`, que en EfficientNet-B0 es apenas la conv 1×1
  final — el modelo prácticamente no se adaptaba al dominio.
- **ResNet-50**: solo `layer4` descongelado, StepLR, 4+6 épocas con
  paciencia 2, sin label smoothing ni pesos por clase,
  `num_workers=0` (la GPU esperaba la decodificación de cada JPEG).

### 1.3 Bugs de integración (independientes de las métricas)

1. **Orden de clases.** Los scripts (y, antes, los notebooks de la Fase 2
   — el error se originó ahí) guardaban las clases en orden
   **alfabético**, pero `ai-service` tomaba la posición de salida del
   modelo como el `indice_clase` de la taxonomía al fusionar. Resultado:
   la predicción fusionada caía en categorías equivocadas (el índice 0
   alfabético es "Abarrotes y snacks"; el 0 de la taxonomía, "Audio y
   audífonos"). Reproducido con una prueba contra el código anterior.
2. **Ruta del artefacto.** `entrenar_cu1.py` copiaba `resnet50.pt` a
   `ai-service/app/modelos/`, que el servicio no lee (busca
   `ai-service/models/cu1-resnet50-v1/modelo.pt`): el servicio seguía en
   modo demo aunque hubiera un modelo entrenado.

## 2. Cambios

### Datos (`ml/preparar_dataset.py`, `ml/fuentes_datos.py`, `ml/DATASET.md`)

- Shopify con sus **dos** splits (antes solo train).
- Dos fuentes complementarias con licencia abierta, verificada, solo para
  las clases débiles: **Fashion Product Images** (MIT) y **Amazon
  Berkeley Objects** (CC BY 4.0), con el mapeo revisado contra nombres
  reales (se descartaron tipos de ABO que traían ruido).
- Selección por clase: Shopify primero, tope de 500 por clase y de 300
  por fuente complementaria. Clases con < 100 ejemplos: **de 11 a 5**.
- Sesgo por fuente controlado (degradación de resolución aleatoria en
  entrenamiento) y medido (métricas por fuente en cada `metricas.json`).

### Modelos (`ml/entrenar_*.py`, `ml/evaluar_fusion.py`)

- **TF-IDF + LogReg:** sigue siendo regresión logística (es el baseline
  que nombra el T1), con TF-IDF sublineal de palabras + caracteres y `C`
  elegido en validación.
- **BETO:** hasta 15 épocas con early stopping (paciencia 3), cabeza con
  LR 10x, pérdida con pesos por clase + label smoothing, weight decay,
  clipping, warmup + decaimiento lineal, fp16 en GPU, padding dinámico.
- **ResNet-50 / EfficientNet-B0:** fine-tuning completo con LR
  discriminativo, warmup + coseno, hasta 25 épocas (paciencia 5),
  TrivialAugmentWide + RandomErasing + degradación de resolución, label
  smoothing, pesos por clase, fp16 + channels_last, DataLoader con
  workers, checkpoint en disco en cada mejora.
- **Fusión:** misma fórmula que `ai-service`; el peso se elige en
  validación y se recomienda para `PESO_FUSION_IMAGEN`.
- Todo usa el orden de la taxonomía y escribe directamente la estructura
  que carga `ai-service`; `exportar_a_ai_service.py` publica los modelos
  (y se niega a publicar los entrenados en modo rápido).

### ai-service

- `app/modelos/distribucion.py`: cada modelo devuelve sus 21
  probabilidades reordenadas **por nombre** al orden de la taxonomía; un
  artefacto con clases desconocidas no se carga.
- La fusión usa las distribuciones completas (antes, un top-5 con el
  resto repartido de forma uniforme).
- BETO trunca con el `max_length` con que se entrenó.
- 5 pruebas nuevas (`tests/test_taxonomia.py`).

## 3. Resultados medidos

_(pendiente: se completa con las corridas de verificación)_
