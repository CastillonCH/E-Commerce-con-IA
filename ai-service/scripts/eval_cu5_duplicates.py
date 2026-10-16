"""CU5 — Detección de productos duplicados.

Meta del T1 (OE3): precisión >= 90% sobre pares verificados manualmente
(Tabla 10). Reutiliza los embeddings de CU1 (imagen) y CU2 (texto) ya
entrenados — por eso CU5 depende de que los dos scripts anteriores ya
hayan corrido (ver Tabla 7 del T1: "reutiliza los embeddings de CU1/CU2").

Qué hace:
  1. Lee el catálogo publicado desde Postgres (DATABASE_URL).
  2. Calcula el embedding de imagen y de texto de cada producto con los
     modelos ya entrenados.
  3. Los guarda en `producto_embeddings` (requiere pgvector — tu Postgres
     local ya lo tiene, según tu propia corrida del script de la base).
  4. Compara todos los pares por similitud coseno y guarda los candidatos
     por encima del umbral en `duplicados_detectados`, listos para que un
     analista los confirme/descarte en /admin/duplicados.

Uso:
    python scripts/eval_cu5_duplicates.py --umbral 0.90
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.inference import image_classifier, text_classifier  # noqa: E402


def similitud_coseno(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--umbral", type=float, default=0.90)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()

    if not args.database_url:
        sys.exit("Falta DATABASE_URL (pásalo con --database-url o en el entorno).")

    conexion = psycopg2.connect(args.database_url)
    conexion.autocommit = True
    cursor = conexion.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cursor.execute(
        """
        SELECT p.id, p.nombre, p.descripcion, pi.url AS imagen_url
          FROM productos p
          LEFT JOIN LATERAL (
                 SELECT url FROM producto_imagenes
                  WHERE producto_id = p.id
                  ORDER BY orden LIMIT 1
               ) pi ON true
         WHERE p.estado = 'publicado'
        """
    )
    productos = cursor.fetchall()
    if len(productos) < 2:
        sys.exit(f"Solo hay {len(productos)} producto(s) publicado(s); no hay nada que comparar.")

    print(f"Calculando embeddings para {len(productos)} productos...")
    cursor.execute("SELECT id, codigo FROM modelos_ia WHERE codigo IN ('cu1-resnet50-v1', 'cu2-beto-v1')")
    modelo_id_por_codigo = {fila["codigo"]: fila["id"] for fila in cursor.fetchall()}

    embeddings_imagen: dict[int, np.ndarray] = {}
    embeddings_texto: dict[int, np.ndarray] = {}

    for producto in productos:
        try:
            if producto["imagen_url"]:
                respuesta = requests.get(producto["imagen_url"], timeout=10)
                respuesta.raise_for_status()
                vector = image_classifier.extraer_embedding(respuesta.content)
                embeddings_imagen[producto["id"]] = np.array(vector)
                if "cu1-resnet50-v1" in modelo_id_por_codigo:
                    cursor.execute(
                        """INSERT INTO producto_embeddings (producto_id, modelo_id, fuente, embedding)
                           VALUES (%s, %s, 'imagen', %s)""",
                        (producto["id"], modelo_id_por_codigo["cu1-resnet50-v1"], vector),
                    )
        except image_classifier.ModeloNoEntrenadoError:
            print("Aviso: CU1 no está entrenado — se omiten embeddings de imagen.")
        except requests.RequestException as error:
            print(f"Aviso: no se pudo descargar la imagen del producto {producto['id']}: {error}")

        try:
            vector = text_classifier.extraer_embedding(producto["nombre"], producto["descripcion"] or "")
            embeddings_texto[producto["id"]] = np.array(vector)
            if "cu2-beto-v1" in modelo_id_por_codigo:
                cursor.execute(
                    """INSERT INTO producto_embeddings (producto_id, modelo_id, fuente, embedding)
                       VALUES (%s, %s, 'texto', %s)""",
                    (producto["id"], modelo_id_por_codigo["cu2-beto-v1"], vector),
                )
        except text_classifier.ModeloNoEntrenadoError:
            print("Aviso: CU2 no está entrenado — se omiten embeddings de texto.")

    print(f"Comparando {len(productos)} productos por pares (umbral={args.umbral})...")
    candidatos = 0
    ids = [p["id"] for p in productos]
    for i, id_a in enumerate(ids):
        for id_b in ids[i + 1 :]:
            sim_imagen = (
                similitud_coseno(embeddings_imagen[id_a], embeddings_imagen[id_b])
                if id_a in embeddings_imagen and id_b in embeddings_imagen
                else None
            )
            sim_texto = (
                similitud_coseno(embeddings_texto[id_a], embeddings_texto[id_b])
                if id_a in embeddings_texto and id_b in embeddings_texto
                else None
            )
            componentes = [s for s in (sim_imagen, sim_texto) if s is not None]
            if not componentes:
                continue
            sim_combinada = sum(componentes) / len(componentes)

            if sim_combinada >= args.umbral:
                a, b = sorted((id_a, id_b))
                cursor.execute(
                    """INSERT INTO duplicados_detectados
                           (producto_a_id, producto_b_id, similitud_texto, similitud_imagen,
                            similitud_combinada, umbral_usado)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (producto_a_id, producto_b_id) DO NOTHING""",
                    (a, b, sim_texto, sim_imagen, round(sim_combinada, 4), args.umbral),
                )
                candidatos += 1

    print(f"\n{candidatos} par(es) candidato(s) a duplicado guardados en duplicados_detectados.")
    print("Revísalos en /admin/duplicados — confirmar/descartar ahí alimenta v_metricas_duplicados")
    print("(precisión real sobre pares verificados, la métrica que pide OE3).")

    cursor.close()
    conexion.close()


if __name__ == "__main__":
    main()
