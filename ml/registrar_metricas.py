"""Registra en modelos_ia las métricas de VALIDACIÓN y de PRUEBA de cada
modelo, con nombres que no se pueden confundir, y deja en producción los
tres modelos que usa la fusión (ResNet-50 + EfficientNet-B0 + BETO).

Las métricas se recalculan desde las probabilidades que guardó cada
entrenamiento (probs_val.npy y probs_test.npy), así validación y prueba
salen del mismo lugar y con la misma fórmula. La fusión usa exactamente
la fórmula del microservicio (ai-service/app/main.py::fusionar).

Genera ml/modelos/registro_metricas.sql (no toca la base: se ejecuta con psql).

Uso, desde la raíz del proyecto:
    python ml/registrar_metricas.py
    psql -v ON_ERROR_STOP=1 -d <tu_base> -f ml/modelos/registro_metricas.sql
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

CARPETA_ML = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_ML))
from comun import CLASES, LABEL2ID  # noqa: E402

CARPETA_MODELOS = CARPETA_ML / "modelos"
CARPETA_DATOS = CARPETA_ML / "datos"
IMAGEN = ["cu1-resnet50-v1", "cu1-efficientnet-b0-v1"]
TEXTO = "cu2-beto-v1"
EN_PRODUCCION = {*IMAGEN, TEXTO, "cu3-fusion-multimodal-v1"}
CODIGO_FUSION = "cu3-fusion-multimodal-v1"


def medir(y: np.ndarray, probs: np.ndarray, prefijo: str) -> dict:
    pred = probs.argmax(axis=1)
    etiquetas = list(range(len(CLASES)))
    return {
        f"{prefijo}_accuracy": round(float(accuracy_score(y, pred)), 4),
        f"{prefijo}_f1_macro": round(float(f1_score(y, pred, labels=etiquetas, average="macro", zero_division=0)), 4),
        f"{prefijo}_precision_macro": round(
            float(precision_score(y, pred, labels=etiquetas, average="macro", zero_division=0)), 4
        ),
        f"{prefijo}_recall_macro": round(float(recall_score(y, pred, labels=etiquetas, average="macro", zero_division=0)), 4),
        f"n_{prefijo}": int(len(y)),
    }


def sql_jsonb(valor: dict) -> str:
    return "'" + json.dumps(valor, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--iteracion", type=int, default=2)
    parser.add_argument("--modelos", type=Path, default=CARPETA_MODELOS, help="Carpeta con los modelos (p. ej. ml/modelos_it3)")
    parser.add_argument("--modelo-tfidf", type=Path, default=None, help="Carpeta de TF-IDF si no es la de --modelos")
    args = parser.parse_args()

    y = {
        parte: pd.read_csv(CARPETA_DATOS / f"{parte}.csv")["categoria"].map(LABEL2ID).to_numpy()
        for parte in ("val", "test")
    }
    probs = {
        codigo: {parte: np.load((args.modelo_tfidf if codigo == "cu2-tfidf-logreg-v1" and args.modelo_tfidf else args.modelos / codigo) / f"probs_{'val' if parte == 'val' else 'test'}.npy") for parte in y}
        for codigo in [*IMAGEN, TEXTO, "cu2-tfidf-logreg-v1"]
    }
    for codigo, partes in probs.items():
        for parte, matriz in partes.items():
            if matriz.shape != (len(y[parte]), len(CLASES)):
                raise SystemExit(f"{codigo}/probs_{parte}: forma {matriz.shape}, se esperaba {(len(y[parte]), len(CLASES))}")

    peso = json.loads((args.modelos / "fusion" / "metricas_fusion.json").read_text(encoding="utf-8"))["peso_fusion_imagen"]
    probs[CODIGO_FUSION] = {
        parte: peso * np.mean([probs[c][parte] for c in IMAGEN], axis=0) + (1 - peso) * probs[TEXTO][parte] for parte in y
    }

    sql = [
        f"-- Métricas de validación y de prueba (iteración {args.iteracion}). Generado por ml/registrar_metricas.py.",
        "-- Convención: val_* = validación (se usó para elegir época y pesos); test_* = prueba (981 productos que",
        "-- ningún modelo vio). Las metas del T1 se comparan con las dos en el panel.",
        "SET search_path = novastore, public;",
        "BEGIN;",
        # Primero todos a 'evaluado' para no chocar con la regla de un modelo por tipo, si aún existiera.
        "UPDATE modelos_ia SET estado = 'evaluado' WHERE estado = 'en_produccion';",
        # La fusión no viene en los datos iniciales del esquema: se crea si falta.
        "INSERT INTO modelos_ia (codigo, caso_uso, tipo, arquitectura, num_clases, estado)"
        f" VALUES ('{CODIGO_FUSION}', 'CU3', 'multimodal', 'Fusión tardía', 21, 'evaluado') ON CONFLICT (codigo) DO NOTHING;",
    ]
    print(f"{'modelo':28} {'val acc':>8} {'val F1':>8} {'test acc':>9} {'test F1':>8}")
    for codigo, partes in probs.items():
        metricas = {"iteracion": args.iteracion}
        for parte, prefijo in (("val", "val"), ("test", "test")):
            metricas.update(medir(y[parte], partes[parte], prefijo))
        if codigo == CODIGO_FUSION:
            metricas["peso_imagen"] = peso
            metricas["peso_texto"] = round(1 - peso, 2)
        print(
            f"{codigo:28} {metricas['val_accuracy']:8.4f} {metricas['val_f1_macro']:8.4f} "
            f"{metricas['test_accuracy']:9.4f} {metricas['test_f1_macro']:8.4f}"
        )
        estado = "en_produccion" if codigo in EN_PRODUCCION else "evaluado"
        extra = ""
        if codigo == CODIGO_FUSION:
            extra = (
                ", arquitectura = 'Fusión tardía: promedio ResNet-50 + EfficientNet-B0 (imagen) con BETO (texto)'"
                f", hiperparametros = COALESCE(hiperparametros, '{{}}'::jsonb) || {sql_jsonb({'peso_imagen': peso})}"
            )
        sql.append(
            f"UPDATE modelos_ia SET metricas = {sql_jsonb(metricas)}, estado = '{estado}', entrenado_en = coalesce(entrenado_en, now()){extra}"
            f" WHERE codigo = '{codigo}';"
        )
    sql += [
        "DO $$ BEGIN ASSERT (SELECT count(*) FROM modelos_ia WHERE estado = 'en_produccion') = 4,",
        "  'Se esperaban 4 en producción (3 modelos + la fusión)'; END $$;",
        "COMMIT;",
        "",
    ]
    salida = args.modelos / "registro_metricas.sql"
    salida.write_text("\n".join(sql), encoding="utf-8")
    print(f"\nSQL listo: {salida}")


if __name__ == "__main__":
    main()
