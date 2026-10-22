"""CU2 — baseline TF-IDF + Regresión logística (cu2-tfidf-logreg-v1).

Sigue siendo una regresión logística (es el baseline que nombra el T1 y
contra el que BETO tiene que ganar), pero con mejoras estándar:
  - TF-IDF sublineal de palabras (1-2 gramas) + de caracteres (2-5 gramas):
    los n-gramas de caracteres aguantan errores de tipeo, plurales y
    palabras que el traductor dejó a medias.
  - C (regularización) elegido en VALIDACIÓN, nunca en test.
  - class_weight="balanced" por el desbalance entre clases.

Uso (PowerShell, desde la carpeta ml):
    .\\.venv\\Scripts\\python.exe entrenar_cu2_tfidf.py
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.pipeline import FeatureUnion, Pipeline

from comun import (
    CARPETA_DATOS, CARPETA_MODELOS, CLASES, LABEL2ID, META_CU2, cargar_particiones, configurar_consola,
    escribir_sql_registro, guardar_matriz_confusion, guardar_resultados, metricas, metricas_por_fuente, resumen,
)

CODIGO = "cu2-tfidf-logreg-v1"


def construir(C: float, con_caracteres: bool) -> Pipeline:
    palabras = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, max_features=100_000, strip_accents=None)
    if con_caracteres:
        features = FeatureUnion([
            ("palabras", palabras),
            ("caracteres", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, max_features=200_000)),
        ])
    else:
        features = palabras
    return Pipeline([
        ("tfidf", features),
        ("clf", LogisticRegression(C=C, max_iter=3000, class_weight="balanced")),
    ])


def main() -> None:
    configurar_consola()
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", type=Path, default=CARPETA_DATOS)
    parser.add_argument("--salida", type=Path, default=CARPETA_MODELOS / CODIGO)
    args = parser.parse_args()

    train, val, test = cargar_particiones(args.datos)
    print(f"[DATOS] train={len(train)} | val={len(val)} | test={len(test)}")

    # Se entrena con los NOMBRES de categoría (no enteros): ai-service usa
    # pipeline.classes_ para nombrar cada probabilidad y mapearla a su
    # indice_clase.
    mejor = None
    for con_caracteres in (False, True):
        for C in (1.0, 5.0, 20.0):
            inicio = time.time()
            modelo = construir(C, con_caracteres).fit(train["texto_es"], train["categoria"])
            f1_val = f1_score(val["categoria"], modelo.predict(val["texto_es"]), average="macro")
            print(f"  caracteres={con_caracteres!s:5} C={C:<5} -> val F1-macro={f1_val:.4f} ({time.time() - inicio:.0f}s)", flush=True)
            if mejor is None or f1_val > mejor[0]:
                mejor = (f1_val, C, con_caracteres)

    f1_val, C, con_caracteres = mejor
    print(f"\nMejor en validación: C={C}, caracteres={con_caracteres} (F1-macro val={f1_val:.4f})")
    # Reentrena con train (no train+val) para que la partición sea idéntica
    # a la de BETO y la fusión, y las métricas sean comparables.
    modelo = construir(C, con_caracteres).fit(train["texto_es"], train["categoria"])

    y_pred = [LABEL2ID[c] for c in modelo.predict(test["texto_es"])]
    m = metricas(test["etiqueta"], y_pred)
    por_fuente = metricas_por_fuente(test, y_pred)
    print("\n" + resumen("TF-IDF + LogReg (test)", m, META_CU2))
    for fuente, valores in por_fuente.items():
        print(f"  {fuente:12} n={valores['n']:4} acc={valores['accuracy']:.4f} f1(clases presentes)={valores['f1_macro_clases_presentes']:.4f}")

    args.salida.mkdir(parents=True, exist_ok=True)
    joblib.dump(modelo, args.salida / "pipeline.joblib")
    # Probabilidades en el orden de la taxonomía (classes_ de sklearn viene
    # en orden alfabético), para evaluar_fusion.py.
    orden = [list(modelo.classes_).index(c) for c in CLASES]
    np.save(args.salida / "probs_val.npy", modelo.predict_proba(val["texto_es"])[:, orden])
    np.save(args.salida / "probs_test.npy", modelo.predict_proba(test["texto_es"])[:, orden])
    hiper = {"C": C, "ngramas_palabras": [1, 2], "ngramas_caracteres": [2, 5] if con_caracteres else None,
             "class_weight": "balanced", "seleccion": "F1-macro en validación"}
    guardar_resultados(args.salida, m, {"por_fuente": por_fuente, "hiperparametros": hiper, "val_f1_macro": f1_val})
    guardar_matriz_confusion(test["etiqueta"], y_pred, args.salida / "matriz_confusion.png")
    sql = escribir_sql_registro(args.salida, CODIGO, m, hiper, f"{CODIGO}/pipeline.joblib")
    print(f"\n[OK] Modelo, métricas y {sql.name} en {args.salida}")


if __name__ == "__main__":
    main()
