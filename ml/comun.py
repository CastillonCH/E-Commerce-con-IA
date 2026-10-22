"""Utilidades compartidas por los scripts de entrenamiento (entrenar_*.py,
evaluar_fusion.py, exportar_a_ai_service.py).

Regla importante: las clases SIEMPRE van en el orden de la taxonomía
(mapeo_categorias.CATEGORIAS = categorias.indice_clase 0..20 en la base y
ai-service/app/config.py). Antes los scripts usaban
sorted(train["categoria"].unique()) — orden alfabético — y eso desalinea
el índice de salida del modelo con el indice_clase que espera ai-service.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd

CARPETA_ML = Path(__file__).resolve().parent
sys.path.insert(0, str(CARPETA_ML))
from mapeo_categorias import CATEGORIAS  # noqa: E402

CARPETA_DATOS = CARPETA_ML / "datos"
CARPETA_MODELOS = CARPETA_ML / "modelos"
CLASES: list[str] = list(CATEGORIAS)
LABEL2ID: dict[str, int] = {c: i for i, c in enumerate(CLASES)}
SEMILLA = 42

# Metas del T1, siempre medidas sobre el conjunto de PRUEBA.
META_CU1 = {"accuracy": 0.80, "f1_macro": 0.75}
META_CU2 = {"f1_macro": 0.85}


def configurar_consola() -> None:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")


def fijar_semillas(semilla: int = SEMILLA) -> None:
    random.seed(semilla)
    np.random.seed(semilla)
    try:
        import torch

        torch.manual_seed(semilla)
        torch.cuda.manual_seed_all(semilla)
    except ImportError:
        pass


def dispositivo() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def cargar_particiones(carpeta: Path = CARPETA_DATOS) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    carpeta = Path(carpeta)
    partes = []
    for nombre in ("train", "val", "test"):
        df = pd.read_csv(carpeta / f"{nombre}.csv")
        if "fuente" not in df.columns:
            df["fuente"] = "shopify"
        df["texto_es"] = df["texto_es"].fillna(df["titulo"]).astype(str)
        df["ruta_imagen"] = [str(r if Path(r).is_absolute() else carpeta / r) for r in df["ruta_imagen"]]
        desconocidas = set(df["categoria"]) - set(CLASES)
        if desconocidas:
            raise ValueError(f"{nombre}.csv tiene categorías fuera de la taxonomía: {desconocidas}")
        df["etiqueta"] = df["categoria"].map(LABEL2ID)
        partes.append(df)
    return partes[0], partes[1], partes[2]


def metricas(y_true, y_pred) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score

    etiquetas = list(range(len(CLASES)))
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "f1_macro": float(f1_score(y_true, y_pred, labels=etiquetas, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, labels=etiquetas, average="weighted", zero_division=0)),
        "precision_macro": float(precision_score(y_true, y_pred, labels=etiquetas, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, labels=etiquetas, average="macro", zero_division=0)),
        "n": int(len(y_true)),
        "reporte_por_clase": classification_report(
            y_true, y_pred, labels=etiquetas, target_names=CLASES, output_dict=True, zero_division=0
        ),
    }


def metricas_por_fuente(df: pd.DataFrame, y_pred) -> dict:
    """Las mismas métricas separadas por fuente de datos. La de "shopify"
    es la más comparable con las corridas anteriores (solo Shopify) y con
    fotos reales de vendedores; ver DATASET.md, "Sesgo por fuente"."""
    from sklearn.metrics import accuracy_score, f1_score

    y_pred = np.asarray(y_pred)
    salida = {}
    for fuente in sorted(df["fuente"].unique()):
        mascara = (df["fuente"] == fuente).to_numpy()
        y_t = df["etiqueta"].to_numpy()[mascara]
        y_p = y_pred[mascara]
        presentes = sorted(set(y_t))
        salida[fuente] = {
            "n": int(mascara.sum()),
            "accuracy": float(accuracy_score(y_t, y_p)),
            "f1_macro_clases_presentes": float(f1_score(y_t, y_p, labels=presentes, average="macro", zero_division=0)),
        }
    return salida


def resumen(nombre: str, m: dict, meta: dict) -> str:
    partes = [f"{nombre}: accuracy={m['accuracy']:.4f} | f1_macro={m['f1_macro']:.4f}"]
    for clave, objetivo in meta.items():
        partes.append(f"meta {clave}>={objetivo:.2f} -> {'CUMPLE' if m[clave] >= objetivo else 'NO CUMPLE'}")
    return " | ".join(partes)


def guardar_resultados(carpeta: Path, m: dict, extra: dict | None = None) -> None:
    """metricas.json compacto (lo lee ai-service y /admin/modelos) y el
    reporte por clase aparte."""
    carpeta.mkdir(parents=True, exist_ok=True)
    compacto = {k: v for k, v in m.items() if k != "reporte_por_clase"}
    if extra:
        compacto.update(extra)
    (carpeta / "metricas.json").write_text(json.dumps(compacto, indent=2, ensure_ascii=False), encoding="utf-8")
    (carpeta / "reporte_por_clase.json").write_text(
        json.dumps(m["reporte_por_clase"], indent=2, ensure_ascii=False), encoding="utf-8"
    )


def guardar_matriz_confusion(y_true, y_pred, ruta: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay

    fig, ax = plt.subplots(figsize=(13, 13))
    ConfusionMatrixDisplay.from_predictions(
        y_true, y_pred, labels=list(range(len(CLASES))), display_labels=CLASES,
        xticks_rotation="vertical", ax=ax, colorbar=False,
    )
    plt.tight_layout()
    plt.savefig(ruta, dpi=110)
    plt.close(fig)


def guardar_curvas(historia: dict, ruta: Path, titulo: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    ax1.plot(historia["epoca"], historia["train_loss"], label="train")
    ax1.plot(historia["epoca"], historia["val_loss"], label="val")
    ax1.set_title(f"{titulo} — pérdida")
    ax1.set_xlabel("Época")
    ax1.legend()
    ax2.plot(historia["epoca"], historia["val_accuracy"], label="val accuracy")
    ax2.plot(historia["epoca"], historia["val_f1_macro"], label="val F1-macro")
    ax2.set_title(f"{titulo} — validación")
    ax2.set_xlabel("Época")
    ax2.legend()
    plt.tight_layout()
    plt.savefig(ruta, dpi=110)
    plt.close(fig)


def _sql_jsonb(valor: dict) -> str:
    return "'" + json.dumps(valor, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def escribir_sql_registro(carpeta: Path, codigo: str, m: dict, hiperparametros: dict, ruta_artefacto: str) -> Path:
    """UPDATE sobre novastore.modelos_ia con las métricas REALES de test.
    Correrlo contra tu PostgreSQL (pgAdmin o psql) — ver docs/ENTRENAMIENTO_LOCAL.md."""
    compacto = {k: v for k, v in m.items() if k != "reporte_por_clase"}
    sql = (
        "UPDATE novastore.modelos_ia\n"
        f"   SET metricas = {_sql_jsonb(compacto)},\n"
        f"       hiperparametros = COALESCE(hiperparametros, '{{}}'::jsonb) || {_sql_jsonb(hiperparametros)},\n"
        "       estado = 'evaluado',\n"
        "       entrenado_en = now(),\n"
        f"       ruta_artefacto = '{ruta_artefacto}'\n"
        f" WHERE codigo = '{codigo}';\n"
    )
    ruta = carpeta / "registro_modelo.sql"
    ruta.write_text(sql, encoding="utf-8")
    return ruta


NOMBRE_ESTADO = "estado_entrenamiento.pt"


def guardar_estado(carpeta: Path, estado: dict) -> None:
    """Estado COMPLETO al final de cada época (pesos, optimizador,
    scheduler, historia, generadores aleatorios) para poder retomar con
    --reanudar si se corta la corrida (Colab desconectado, apagón, reinicio).
    Se escribe a un temporal y se renombra: un corte a mitad de la
    escritura no deja un archivo roto."""
    import torch

    estado = {**estado, "rng": {"python": random.getstate(), "numpy": np.random.get_state(),
                                "torch": torch.get_rng_state()}}
    temporal = carpeta / (NOMBRE_ESTADO + ".tmp")
    torch.save(estado, temporal)
    temporal.replace(carpeta / NOMBRE_ESTADO)


def cargar_estado(carpeta: Path) -> dict | None:
    import torch

    ruta = carpeta / NOMBRE_ESTADO
    if not ruta.exists():
        return None
    # weights_only=False: es un archivo que escribió este mismo script en
    # tu disco (incluye el estado de numpy, que no es un tensor); nunca
    # cargues así un archivo de origen desconocido.
    estado = torch.load(ruta, map_location="cpu", weights_only=False)
    random.setstate(estado["rng"]["python"])
    np.random.set_state(estado["rng"]["numpy"])
    torch.set_rng_state(estado["rng"]["torch"])
    print(f"[REANUDAR] Retomando desde el final de la época {estado['epoca']} ({ruta})", flush=True)
    return estado


def borrar_estado(carpeta: Path) -> None:
    (carpeta / NOMBRE_ESTADO).unlink(missing_ok=True)


def pesos_por_clase(etiquetas, potencia: float = 0.5) -> np.ndarray:
    """Peso (1/frecuencia)^potencia por clase, normalizado a media 1.
    potencia=0.5 (raíz) ayuda a las clases chicas sin sobrecorregir."""
    conteo = np.bincount(np.asarray(etiquetas), minlength=len(CLASES)).astype(float)
    pesos = np.where(conteo > 0, (1.0 / np.maximum(conteo, 1.0)) ** potencia, 0.0)
    return pesos / pesos[conteo > 0].mean()
