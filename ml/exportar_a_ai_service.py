"""Copia los modelos entrenados de ml/modelos/<codigo>/ a
ai-service/models/<codigo>/ con exactamente los nombres de archivo que
carga ai-service (app/modelos/registro.py).

Antes el script de imagen copiaba resnet50.pt a ai-service/app/modelos/,
una carpeta que ai-service no lee: el servicio seguía en modo demo aunque
hubiera un modelo entrenado.

Uso (PowerShell, desde la carpeta ml):
    .\\.venv\\Scripts\\python.exe exportar_a_ai_service.py
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from comun import CARPETA_ML, CARPETA_MODELOS, CLASES, NOMBRE_ESTADO, configurar_consola

DESTINO_POR_DEFECTO = CARPETA_ML.parent / "ai-service" / "models"
ARCHIVOS = {
    "cu1-resnet50-v1": ["modelo.pt", "metricas.json"],
    "cu1-efficientnet-b0-v1": ["modelo.pt", "metricas.json"],
    "cu2-tfidf-logreg-v1": ["pipeline.joblib", "metricas.json"],
    "cu2-beto-v1": None,  # carpeta de save_pretrained completa (menos lo que no sirve para servir)
}
NO_COPIAR = {".npy", ".png", ".sql"}


def main() -> None:
    configurar_consola()
    parser = argparse.ArgumentParser()
    parser.add_argument("--origen", type=Path, default=CARPETA_MODELOS)
    parser.add_argument("--destino", type=Path, default=DESTINO_POR_DEFECTO)
    parser.add_argument("--permitir-modo-rapido", action="store_true",
                        help="Exporta igual modelos entrenados con --modo-rapido (solo para pruebas).")
    args = parser.parse_args()

    args.destino.mkdir(parents=True, exist_ok=True)
    (args.destino / "labels.json").write_text(
        json.dumps({str(i): c for i, c in enumerate(CLASES)}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    exportados, sql = [], []
    for codigo, archivos in ARCHIVOS.items():
        origen = args.origen / codigo
        if not (origen / "metricas.json").exists():
            print(f"  [--] {codigo}: no entrenado todavía (no hay {origen / 'metricas.json'})")
            continue
        metricas = json.loads((origen / "metricas.json").read_text(encoding="utf-8"))
        if metricas.get("modo_rapido") and not args.permitir_modo_rapido:
            print(f"  [!!] {codigo}: entrenado en modo rápido, NO se exporta (sus métricas no valen).")
            continue
        destino = args.destino / codigo
        if destino.exists():
            shutil.rmtree(destino)
        destino.mkdir(parents=True)
        nombres = archivos or [p.name for p in origen.iterdir()
                               if p.is_file() and p.suffix not in NO_COPIAR and not p.name.startswith(NOMBRE_ESTADO)]
        for nombre in nombres:
            shutil.copy2(origen / nombre, destino / nombre)
        exportados.append(codigo)
        if (origen / "registro_modelo.sql").exists():
            sql.append(origen / "registro_modelo.sql")
        print(f"  [OK] {codigo}: accuracy={metricas['accuracy']:.4f} f1_macro={metricas['f1_macro']:.4f} -> {destino}")

    fusion = args.origen / "fusion" / "metricas_fusion.json"
    print(f"\nExportados: {exportados or 'ninguno'}")
    if sql:
        print("\nRegistra las métricas en PostgreSQL corriendo estos archivos (pgAdmin o psql):")
        for ruta in sql:
            print(f"  {ruta}")
    if fusion.exists():
        peso = json.loads(fusion.read_text(encoding="utf-8"))["peso_fusion_imagen"]
        print(f"\nEn ai-service/.env pon: PESO_FUSION_IMAGEN={peso:.2f}")
    print("Reinicia ai-service y revisa http://localhost:8000/health (debe decir \"modo\": \"real\").")


if __name__ == "__main__":
    main()
