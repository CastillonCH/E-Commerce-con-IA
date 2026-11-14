"""Diagnóstico de la IA tal como la usa la tienda, con el conjunto de PRUEBA.

Manda cada producto de ml/datos/test.csv (981, nunca vistos al entrenar) al
endpoint POST /clasificar del microservicio, en el mismo proceso (sin
levantar el servidor), con los modelos de ai-service/models y el peso de
fusión de ai-service/.env. Así se mide exactamente lo que ve quien carga.

Genera en ml/modelos/diagnostico/:
  resumen.json        accuracy y F1-macro de la fusión y de cada modelo
  por_clase.csv       precisión, recall, F1 y ejemplos por categoría
  confusiones.csv     los pares (real → predicha) que más se repiten
  por_confianza.csv   cuánto acierta según la confianza (umbral de revisión)
  errores.csv         cada producto mal clasificado, con lo que dijo cada modelo

Uso, desde la raíz del proyecto (con las dependencias de ai-service):
    python ml/diagnostico_prueba.py            # las 981
    python ml/diagnostico_prueba.py --limite 50
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
AI_SERVICE = RAIZ / "ai-service"


def separar_texto(texto_es: str, descripcion_original: str) -> tuple[str, str]:
    """Igual que el kit del experimento: título y descripción en español."""
    texto = " ".join(str(texto_es).split())
    if str(descripcion_original).strip() and ". " in texto:
        titulo, resto = texto.split(". ", 1)
        return titulo, resto
    return texto, ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--test", type=Path, default=RAIZ / "ml" / "datos" / "test.csv")
    parser.add_argument("--imagenes", type=Path, default=RAIZ / "ml" / "datos" / "imagenes")
    parser.add_argument("--salida", type=Path, default=RAIZ / "ml" / "modelos" / "diagnostico")
    parser.add_argument("--limite", type=int, default=0)
    args = parser.parse_args()

    # El servicio lee su .env y la carpeta ./models relativa a ai-service.
    os.chdir(AI_SERVICE)
    sys.path.insert(0, str(AI_SERVICE))
    import logging  # noqa: E402

    logging.disable(logging.INFO)
    from fastapi.testclient import TestClient  # noqa: E402
    from sklearn.metrics import classification_report, f1_score  # noqa: E402

    from app.config import CATEGORIAS, settings  # noqa: E402
    from app.main import app  # noqa: E402  (carga los modelos)

    registro = app.state.registro
    print(f"Modo: {registro.modo} · modelos: {', '.join(registro.codigos_cargados)} · peso imagen: {settings.peso_fusion_imagen}")
    if registro.modo != "real":
        raise SystemExit("El servicio no tiene modelos reales cargados.")
    cliente = TestClient(app)
    cabeceras = {"X-API-Key": settings.ai_api_key} if settings.ai_api_key else {}

    with args.test.open(encoding="utf-8", newline="") as archivo:
        filas = list(csv.DictReader(archivo))
    if args.limite:
        filas = filas[: args.limite]

    reales, fusion, por_modelo, registros, rechazadas = [], [], {}, [], []
    inicio = time.perf_counter()
    for numero, fila in enumerate(filas, start=1):
        titulo, descripcion = separar_texto(fila["texto_es"], fila["descripcion"])
        foto = args.imagenes / f"{fila['id']}.jpg"
        respuesta = cliente.post(
            "/clasificar",
            data={"titulo": titulo, "descripcion": descripcion},
            files={"imagen": (foto.name, foto.read_bytes(), "image/jpeg")},
            headers=cabeceras,
        )
        if respuesta.status_code != 200:
            # El formulario de la tienda tampoco aceptaría esta ficha (p. ej. sin título).
            rechazadas.append({"id": fila["id"], "estado": respuesta.status_code, "detalle": respuesta.text[:200]})
            continue
        cuerpo = respuesta.json()
        predicha = cuerpo["resultado"]["categoria"]
        reales.append(fila["categoria"])
        fusion.append(predicha)
        modelos = {m["codigo_modelo"]: m["categoria"] for m in cuerpo["por_modelo"]}
        for codigo, categoria in modelos.items():
            por_modelo.setdefault(codigo, []).append(categoria)
        registros.append(
            {
                "id": fila["id"],
                "fuente": fila["fuente"],
                "titulo": titulo[:120],
                "real": fila["categoria"],
                "predicha": predicha,
                "confianza": round(cuerpo["resultado"]["confianza"], 4),
                "segunda": cuerpo["resultado"]["top_k"][1]["categoria"] if len(cuerpo["resultado"]["top_k"]) > 1 else "",
                **{f"pred_{codigo}": categoria for codigo, categoria in modelos.items()},
            }
        )
        if numero % 100 == 0:
            print(f"  {numero}/{len(filas)} ({time.perf_counter() - inicio:.0f} s)", flush=True)

    args.salida.mkdir(parents=True, exist_ok=True)
    clases = list(CATEGORIAS)

    def medir(predichas: list[str]) -> dict:
        aciertos = sum(r == p for r, p in zip(reales, predichas))
        return {
            "accuracy": round(aciertos / len(reales), 4),
            "f1_macro": round(float(f1_score(reales, predichas, labels=clases, average="macro", zero_division=0)), 4),
        }

    resumen = {
        "n": len(reales),
        "peso_fusion_imagen": settings.peso_fusion_imagen,
        "modelos_cargados": registro.codigos_cargados,
        "fusion": medir(fusion),
        "por_modelo": {codigo: medir(predichas) for codigo, predichas in por_modelo.items()},
        "por_fuente": {},
        "segundos_por_producto": round((time.perf_counter() - inicio) / len(reales), 3),
        "rechazadas_por_el_servicio": rechazadas,
    }
    for fuente in sorted({r["fuente"] for r in registros}):
        del_origen = [r for r in registros if r["fuente"] == fuente]
        resumen["por_fuente"][fuente] = {
            "n": len(del_origen),
            "accuracy": round(sum(r["real"] == r["predicha"] for r in del_origen) / len(del_origen), 4),
        }
    (args.salida / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")

    reporte = classification_report(reales, fusion, labels=clases, output_dict=True, zero_division=0)
    with (args.salida / "por_clase.csv").open("w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["categoria", "ejemplos_prueba", "precision", "recall", "f1"])
        for clase in sorted(clases, key=lambda c: reporte[c]["f1-score"]):
            r = reporte[clase]
            escritor.writerow([clase, int(r["support"]), round(r["precision"], 3), round(r["recall"], 3), round(r["f1-score"], 3)])

    confusiones = Counter((r["real"], r["predicha"]) for r in registros if r["real"] != r["predicha"])
    with (args.salida / "confusiones.csv").open("w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["real", "predicha", "veces"])
        for (real, predicha), veces in confusiones.most_common():
            escritor.writerow([real, predicha, veces])

    # ¿Cuánto acierta la IA cuando está "segura"? Define qué se puede
    # publicar solo (REVIEW_THRESHOLD) sin pasar del 5 % de error.
    with (args.salida / "por_confianza.csv").open("w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["umbral", "fichas_sobre_umbral", "pct_fichas", "error_sobre_umbral_pct"])
        for umbral in [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]:
            sobre = [r for r in registros if r["confianza"] >= umbral]
            error = 100 * sum(r["real"] != r["predicha"] for r in sobre) / len(sobre) if sobre else 0
            escritor.writerow([umbral, len(sobre), round(100 * len(sobre) / len(registros), 1), round(error, 2)])

    errores = [r for r in registros if r["real"] != r["predicha"]]
    campos = sorted({k for r in registros for k in r}, key=lambda k: list(registros[0]).index(k) if k in registros[0] else 99)
    with (args.salida / "errores.csv").open("w", encoding="utf-8-sig", newline="") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=campos)
        escritor.writeheader()
        escritor.writerows(sorted(errores, key=lambda r: (r["real"], -r["confianza"])))

    print(json.dumps(resumen, ensure_ascii=False, indent=2))
    print(f"Archivos en {args.salida}")


if __name__ == "__main__":
    main()
