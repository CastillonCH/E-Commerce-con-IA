"""Fusión imagen + texto, con la MISMA fórmula que usa ai-service
(app/main.py, fusionar):

    P = peso_imagen * promedio(modelos de imagen) + (1 - peso_imagen) * P_texto

Elige peso_imagen en VALIDACIÓN (barrido de 0 a 1 cada 0.05) y reporta
test. El valor elegido es el que va en PESO_FUSION_IMAGEN de
ai-service/.env.

Lee las probabilidades que guardó cada script de entrenamiento
(probs_val.npy / probs_test.npy, ya en el orden de la taxonomía), así que
no vuelve a correr ningún modelo.

Uso (PowerShell, desde la carpeta ml):
    .\\.venv\\Scripts\\python.exe evaluar_fusion.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from comun import (
    CARPETA_DATOS, CARPETA_MODELOS, META_CU1, cargar_particiones, configurar_consola, metricas,
    metricas_por_fuente, resumen,
)

IMAGEN = ["cu1-resnet50-v1", "cu1-efficientnet-b0-v1"]
TEXTO = {"beto": "cu2-beto-v1", "tfidf": "cu2-tfidf-logreg-v1"}


def cargar_probs(carpeta_modelos: Path, codigo: str, n_val: int, n_test: int) -> tuple[np.ndarray, np.ndarray] | None:
    carpeta = carpeta_modelos / codigo
    if not (carpeta / "probs_val.npy").exists():
        return None
    val, test = np.load(carpeta / "probs_val.npy"), np.load(carpeta / "probs_test.npy")
    if len(val) != n_val or len(test) != n_test:
        raise ValueError(f"{codigo}: las probabilidades guardadas no corresponden a la partición actual "
                         "(¿se regeneró el dataset después de entrenar?). Vuelve a entrenar ese modelo.")
    return val, test


def main() -> None:
    configurar_consola()
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", type=Path, default=CARPETA_DATOS)
    parser.add_argument("--modelos", type=Path, default=CARPETA_MODELOS)
    parser.add_argument("--texto", choices=["auto", "beto", "tfidf"], default="auto",
                        help="auto = BETO si está entrenado, si no TF-IDF (igual que ai-service).")
    args = parser.parse_args()

    _, val, test = cargar_particiones(args.datos)
    imagenes = {c: p for c in IMAGEN if (p := cargar_probs(args.modelos, c, len(val), len(test))) is not None}
    candidatos_texto = ["beto", "tfidf"] if args.texto == "auto" else [args.texto]
    texto = None
    for nombre in candidatos_texto:
        if (p := cargar_probs(args.modelos, TEXTO[nombre], len(val), len(test))) is not None:
            texto = (TEXTO[nombre], p)
            break
    if not imagenes or texto is None:
        raise SystemExit("Hace falta al menos un modelo de imagen y uno de texto entrenados (con probs_*.npy).")

    img_val = np.mean([p[0] for p in imagenes.values()], axis=0)
    img_test = np.mean([p[1] for p in imagenes.values()], axis=0)
    txt_val, txt_test = texto[1]
    print(f"Imagen: {list(imagenes)} (promedio) | Texto: {texto[0]}")

    mejor = None
    for peso in np.round(np.arange(0, 1.0001, 0.05), 2):
        m = metricas(val["etiqueta"], (peso * img_val + (1 - peso) * txt_val).argmax(1))
        if mejor is None or m["f1_macro"] > mejor[1]:
            mejor = (float(peso), m["f1_macro"])
    peso, f1_val = mejor
    print(f"Peso de imagen elegido en validación: {peso:.2f} (F1-macro val={f1_val:.4f})")

    pred = (peso * img_test + (1 - peso) * txt_test).argmax(1)
    m_test = metricas(test["etiqueta"], pred)
    por_fuente = metricas_por_fuente(test, pred)
    print("\n" + resumen("Fusión (test)", m_test, META_CU1))
    for fuente, valores in por_fuente.items():
        print(f"  {fuente:12} n={valores['n']:4} acc={valores['accuracy']:.4f} f1(clases presentes)={valores['f1_macro_clases_presentes']:.4f}")
    for codigo, (_, p_test) in {**imagenes, texto[0]: texto[1]}.items():
        print(resumen(f"  solo {codigo:24}", metricas(test["etiqueta"], p_test.argmax(1)), META_CU1))

    salida = args.modelos / "fusion"
    salida.mkdir(parents=True, exist_ok=True)
    resultado = {
        "peso_fusion_imagen": peso,
        "modelos_imagen": list(imagenes),
        "modelo_texto": texto[0],
        "val_f1_macro": f1_val,
        **{k: v for k, v in m_test.items() if k != "reporte_por_clase"},
        "por_fuente": por_fuente,
    }
    (salida / "metricas_fusion.json").write_text(json.dumps(resultado, indent=2, ensure_ascii=False), encoding="utf-8")
    (salida / "reporte_por_clase.json").write_text(json.dumps(m_test["reporte_por_clase"], indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[OK] {salida / 'metricas_fusion.json'}")
    print(f"Pon PESO_FUSION_IMAGEN={peso:.2f} en ai-service/.env")


if __name__ == "__main__":
    main()
