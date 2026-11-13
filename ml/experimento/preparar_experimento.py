"""Prepara el kit del experimento "catalogación sin IA vs con IA".

Toma productos del conjunto de PRUEBA del dataset (ml/datos/test.csv: los
modelos nunca los vieron al entrenar), los reparte en dos grupos parecidos
(A y B, la misma cantidad por categoría) y genera:

  experimento/fichas_grupo_A.csv   lo que carga el personal: nombre,
  experimento/fichas_grupo_B.csv   descripción, marca, precio, stock y foto.
                                   SIN la categoría.
  experimento/fotos/EXP-001.jpg    la foto de cada ficha.
  experimento/referencia.sql       la categoría correcta de cada ficha, para
                                   la tabla experimento_fichas (migración 006).
                                   No se le entrega al personal.

Cuando alguien guarda una ficha con el mismo nombre, el sistema la enlaza
sola a su categoría de referencia, y "Modelos de IA" mide el error contra
ella (no contra lo que decidió la IA o el revisor).

Uso (desde la raíz del proyecto):
    python ml/experimento/preparar_experimento.py --por-categoria 2
    psql -v ON_ERROR_STOP=1 -d <tu_base> -f experimento/referencia.sql

Cómo correr el experimento (contrabalanceo):
  1. En Personal: catalogador 1 "Sin IA", catalogador 2 "Con IA".
     Los dos cargan el grupo A.
  2. Se invierten los modos y los dos cargan el grupo B.
  3. Un administrador revisa la cola (no las fichas que cargó él mismo).
  4. "Modelos de IA" → "Proceso completo: sin IA vs con IA".
"""

from __future__ import annotations

import argparse
import csv
import random
import shutil
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SEMILLA = 2026
MAX_NOMBRE = 90
MAX_DESCRIPCION = 600


def recortar(texto: str, maximo: int) -> str:
    texto = " ".join(texto.split())
    if len(texto) <= maximo:
        return texto
    corte = texto[:maximo].rsplit(" ", 1)[0]
    return corte.rstrip(" ,.;:-")


def nombre_y_descripcion(fila: dict[str, str]) -> tuple[str, str]:
    """texto_es es "título. descripción" en español (ml/preparar_dataset.py)."""
    texto = fila["texto_es"].strip()
    if fila["descripcion"].strip() and ". " in texto:
        titulo, resto = texto.split(". ", 1)
    else:
        titulo, resto = texto, ""
    nombre = recortar(titulo, MAX_NOMBRE)
    descripcion = recortar(resto, MAX_DESCRIPCION)
    if len(descripcion) < 20:
        descripcion = f"{nombre}. Revisa la foto para ver el producto."
    return nombre, descripcion


def sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--por-categoria", type=int, default=2, help="fichas por categoría (21 categorías); par = grupos iguales")
    parser.add_argument("--test", type=Path, default=RAIZ / "ml" / "datos" / "test.csv")
    parser.add_argument("--imagenes", type=Path, default=RAIZ / "ml" / "datos" / "imagenes")
    parser.add_argument("--salida", type=Path, default=RAIZ / "experimento")
    args = parser.parse_args()

    with args.test.open(encoding="utf-8", newline="") as archivo:
        filas = list(csv.DictReader(archivo))

    por_categoria: dict[str, list[dict[str, str]]] = defaultdict(list)
    for fila in filas:
        if (args.imagenes / f"{fila['id']}.jpg").exists():
            por_categoria[fila["categoria"]].append(fila)

    azar = random.Random(SEMILLA)
    elegidas: list[tuple[str, dict[str, str]]] = []
    nombres_usados: set[str] = set()
    for indice, categoria in enumerate(sorted(por_categoria)):
        candidatas = por_categoria[categoria][:]
        azar.shuffle(candidatas)
        tomadas = 0
        for fila in candidatas:
            nombre, _ = nombre_y_descripcion(fila)
            if nombre.lower() in nombres_usados or len(nombre) < 2:
                continue
            nombres_usados.add(nombre.lower())
            # Alterna A/B dentro de la categoría (y empieza distinto en cada una):
            # los dos grupos quedan parecidos.
            elegidas.append(("AB"[(tomadas + indice) % 2], fila))
            tomadas += 1
            if tomadas == args.por_categoria:
                break
        if tomadas < args.por_categoria:
            print(f"Aviso: {categoria} solo tiene {tomadas} fichas utilizables.")

    azar.shuffle(elegidas)  # que el orden de carga no siga las categorías

    if args.salida.exists():
        shutil.rmtree(args.salida)
    (args.salida / "fotos").mkdir(parents=True)

    campos = ["codigo", "nombre", "descripcion", "marca", "precio", "stock", "foto"]
    grupos: dict[str, list[dict[str, str]]] = {"A": [], "B": []}
    sql = [
        "-- Categoría de referencia del experimento (generado por ml/experimento/preparar_experimento.py).",
        "-- No se le entrega al personal. Se puede ejecutar más de una vez.",
        "SET search_path = novastore, public;",
        "BEGIN;",
    ]
    for numero, (grupo, fila) in enumerate(elegidas, start=1):
        codigo = f"EXP-{numero:03d}"
        nombre, descripcion = nombre_y_descripcion(fila)
        foto = f"fotos/{codigo}.jpg"
        shutil.copyfile(args.imagenes / f"{fila['id']}.jpg", args.salida / foto)
        grupos[grupo].append(
            {
                "codigo": codigo,
                "nombre": nombre,
                "descripcion": descripcion,
                "marca": "Genérica",
                "precio": f"{azar.randrange(1990, 29990, 100) / 100:.2f}",
                "stock": "10",
                "foto": foto,
            }
        )
        sql.append(
            "INSERT INTO experimento_fichas (codigo, grupo, nombre, categoria_referencia_id, fuente) "
            f"SELECT {sql_texto(codigo)}, {sql_texto(grupo)}, {sql_texto(nombre)}, c.id, "
            f"{sql_texto('test.csv#' + fila['id'])} FROM categorias c WHERE c.nombre = {sql_texto(fila['categoria'])} "
            "ON CONFLICT (codigo) DO NOTHING;"
        )
    sql += [
        f"DO $$ BEGIN ASSERT (SELECT count(*) FROM experimento_fichas WHERE codigo LIKE 'EXP-%') >= {len(elegidas)},",
        "  'Alguna categoría del dataset no existe en la tabla categorias'; END $$;",
        "COMMIT;",
        "",
    ]

    for grupo, fichas in grupos.items():
        with (args.salida / f"fichas_grupo_{grupo}.csv").open("w", encoding="utf-8-sig", newline="") as archivo:
            escritor = csv.DictWriter(archivo, fieldnames=campos)
            escritor.writeheader()
            escritor.writerows(sorted(fichas, key=lambda f: f["codigo"]))
    (args.salida / "referencia.sql").write_text("\n".join(sql), encoding="utf-8")

    print(f"Kit listo en {args.salida}: {len(grupos['A'])} fichas en el grupo A y {len(grupos['B'])} en el B.")
    print("Siguiente paso: psql -v ON_ERROR_STOP=1 -d <tu_base> -f experimento/referencia.sql")


if __name__ == "__main__":
    main()
