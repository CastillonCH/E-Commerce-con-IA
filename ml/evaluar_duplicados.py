"""OE3: precisión del detector de duplicados con pares SIMULADOS.

Escenario (el mismo que vive quien carga una ficha): ya hay un catálogo y
llega un producto nuevo. La tienda calcula sus embeddings (ResNet-50,
EfficientNet-B0 y BETO, igual que ai-service) y avisa "posible duplicado"
si algún producto del catálogo pasa el umbral de similitud coseno.

Para cada conjunto (validación y prueba, por separado):
  - catálogo  = 2/3 de los productos;
  - consultas = copias modificadas de 300 productos del catálogo (DUPLICADOS:
                otra foto del mismo producto -recorte, giro, luz, compresión-
                y otro título -mayúsculas, palabras de más/de menos, typo-)
              + el 1/3 restante (productos NUEVOS: no deberían avisar).
Precisión = avisos correctos / avisos totales (meta OE3: >= 90 %).
El umbral y la regla se eligen en VALIDACIÓN; prueba se mide una sola vez.

Uso, desde la raíz del proyecto (con las dependencias de ai-service):
    python ml/evaluar_duplicados.py
"""

from __future__ import annotations

import io
import json
import os
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageEnhance, ImageOps

RAIZ = Path(__file__).resolve().parents[1]
AI_SERVICE = RAIZ / "ai-service"
DATOS = RAIZ / "ml" / "datos"
SALIDA = RAIZ / "ml" / "modelos" / "duplicados"
N_DUPLICADOS = 300
SEMILLA = 42
MODELOS = ["cu1-resnet50-v1", "cu1-efficientnet-b0-v1", "cu2-beto-v1"]
EXTRAS = ["Nuevo", "Original", "Oferta", "Envío gratis", "Stock disponible", "2024", "Calidad premium"]


def separar_texto(texto_es: str, descripcion_original: str) -> tuple[str, str]:
    texto = " ".join(str(texto_es).split())
    if str(descripcion_original).strip() and str(descripcion_original) != "nan" and ". " in texto:
        titulo, resto = texto.split(". ", 1)
        return titulo, resto
    return texto, ""


def foto_modificada(ruta: Path, rnd: random.Random) -> bytes:
    """Otra foto del mismo producto: recorte, espejo, luz, giro leve y otra compresión."""
    img = Image.open(ruta).convert("RGB")
    w, h = img.size
    escala = rnd.uniform(0.80, 0.95)
    cw, ch = int(w * escala), int(h * escala)
    x, y = rnd.randint(0, w - cw), rnd.randint(0, h - ch)
    img = img.crop((x, y, x + cw, y + ch))
    if rnd.random() < 0.5:
        img = ImageOps.mirror(img)
    img = img.rotate(rnd.uniform(-6, 6), expand=False, fillcolor=(255, 255, 255))
    img = ImageEnhance.Brightness(img).enhance(rnd.uniform(0.85, 1.15))
    img = ImageEnhance.Contrast(img).enhance(rnd.uniform(0.85, 1.15))
    lado = rnd.choice([320, 480, 640, 800])
    img = img.resize((lado, int(lado * img.height / img.width)))
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=rnd.randint(60, 85))
    return buffer.getvalue()


def typo(palabra: str, rnd: random.Random) -> str:
    if len(palabra) < 4:
        return palabra
    i = rnd.randint(1, len(palabra) - 2)
    return palabra[:i] + palabra[i + 1] + palabra[i] + palabra[i + 2 :]


def titulo_modificado(titulo: str, rnd: random.Random) -> str:
    """Cómo otra persona escribiría el mismo producto."""
    palabras = titulo.split()
    cambios = rnd.sample(["caso", "extra", "quitar", "typo", "orden"], k=rnd.randint(1, 3))
    for cambio in cambios:
        if cambio == "caso":
            palabras = [p.lower() for p in palabras] if rnd.random() < 0.5 else [p.capitalize() for p in palabras]
        elif cambio == "extra":
            extra = rnd.choice(EXTRAS).split()
            palabras = extra + palabras if rnd.random() < 0.5 else palabras + ["-"] + extra
        elif cambio == "quitar" and len(palabras) > 4:
            palabras.pop(rnd.randrange(1, len(palabras)))
        elif cambio == "typo" and palabras:
            i = rnd.randrange(len(palabras))
            palabras[i] = typo(palabras[i], rnd)
        elif cambio == "orden" and len(palabras) > 3:
            i = rnd.randrange(len(palabras) - 1)
            palabras[i], palabras[i + 1] = palabras[i + 1], palabras[i]
    return " ".join(palabras)


def descripcion_modificada(descripcion: str, rnd: random.Random) -> str:
    opcion = rnd.random()
    if not descripcion or opcion < 0.3:
        return descripcion
    if opcion < 0.6:
        return descripcion.split(". ")[0]  # solo la primera oración
    if opcion < 0.8:
        return ""  # sin descripción
    return descripcion + " Consulta disponibilidad."


def normalizar(m: np.ndarray) -> np.ndarray:
    return m / np.clip(np.linalg.norm(m, axis=1, keepdims=True), 1e-9, None)


def embeddings_de(registro, cargador_imagen, cargador_texto, items: list[dict]) -> dict[str, np.ndarray]:
    salida = {m: [] for m in MODELOS}
    for n, item in enumerate(items, start=1):
        for codigo in MODELOS[:2]:
            salida[codigo].append(cargador_imagen.embedding(registro.modelos_imagen[codigo], item["foto"]))
        salida["cu2-beto-v1"].append(cargador_texto.embedding_beto(registro.modelo_beto, item["titulo"], item["descripcion"]))
        if n % 200 == 0:
            print(f"    {n}/{len(items)}", flush=True)
    return {m: normalizar(np.asarray(v, dtype=np.float32)) for m, v in salida.items()}


def armar_conjunto(nombre: str, registro, cargador_imagen, cargador_texto) -> dict:
    cache = SALIDA / f"emb_{nombre}.npz"
    df = pd.read_csv(DATOS / f"{nombre}.csv", dtype={"id": str})
    df = df[df["texto_es"].fillna("").str.strip().str.len() >= 2].reset_index(drop=True)
    rnd = random.Random(SEMILLA)
    orden = list(range(len(df)))
    rnd.shuffle(orden)
    corte = (2 * len(df)) // 3
    catalogo_idx, nuevos_idx = orden[:corte], orden[corte:]
    duplicados_idx = rnd.sample(catalogo_idx, N_DUPLICADOS)

    if cache.exists():
        datos = np.load(cache, allow_pickle=True)
        emb_cat = {m: datos[f"cat_{m}"] for m in MODELOS}
        emb_con = {m: datos[f"con_{m}"] for m in MODELOS}
        ejemplos = json.loads(str(datos["ejemplos"]))
    else:
        def item(i: int, modificado: bool) -> dict:
            fila = df.iloc[i]
            titulo, descripcion = separar_texto(fila["texto_es"], fila["descripcion"])
            ruta = DATOS / "imagenes" / f"{fila['id']}.jpg"
            if not modificado:
                return {"titulo": titulo, "descripcion": descripcion, "foto": ruta.read_bytes()}
            return {
                "titulo": titulo_modificado(titulo, rnd),
                "descripcion": descripcion_modificada(descripcion, rnd),
                "foto": foto_modificada(ruta, rnd),
                "original": titulo,
            }

        print(f"  {nombre}: catálogo {len(catalogo_idx)}, consultas {N_DUPLICADOS} duplicadas + {len(nuevos_idx)} nuevas")
        catalogo = [item(i, False) for i in catalogo_idx]
        consultas = [item(i, True) for i in duplicados_idx] + [item(i, False) for i in nuevos_idx]
        ejemplos = [{"original": c["original"], "copia": c["titulo"]} for c in consultas[:15]]
        emb_cat = embeddings_de(registro, cargador_imagen, cargador_texto, catalogo)
        emb_con = embeddings_de(registro, cargador_imagen, cargador_texto, consultas)
        np.savez(cache, **{f"cat_{m}": emb_cat[m] for m in MODELOS}, **{f"con_{m}": emb_con[m] for m in MODELOS},
                 ejemplos=json.dumps(ejemplos, ensure_ascii=False))

    # Índice (en el catálogo) del original de cada consulta; -1 = producto nuevo.
    posicion = {i: p for p, i in enumerate(catalogo_idx)}
    verdad = np.array([posicion[i] for i in duplicados_idx] + [-1] * len(nuevos_idx))
    sims = {m: emb_con[m] @ emb_cat[m].T for m in MODELOS}  # coseno (vectores normalizados)
    return {"sims": sims, "verdad": verdad, "ejemplos": ejemplos, "n_catalogo": len(catalogo_idx)}


def reglas(sims: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Puntaje por par (consulta, producto del catálogo) según cada regla."""
    r, e, t = sims["cu1-resnet50-v1"], sims["cu1-efficientnet-b0-v1"], sims["cu2-beto-v1"]
    imagen = (r + e) / 2
    return {
        # Regla actual de la tienda: avisa si CUALQUIER modelo pasa el umbral.
        "cualquiera (actual)": np.maximum(np.maximum(r, e), t),
        "promedio de los 3": (r + e + t) / 3,
        "imagen y texto (mínimo)": np.minimum(imagen, t),
        "solo imagen": imagen,
        "solo texto (BETO)": t,
    }


def medir(puntaje: np.ndarray, verdad: np.ndarray, umbral: float, top_k: int = 3) -> dict:
    """Como buscarDuplicadosPorEmbeddings: hasta top_k avisos por consulta sobre el umbral."""
    vp = fp = 0
    encontrados = 0
    for q in range(len(verdad)):
        fila = puntaje[q]
        candidatos = np.argsort(-fila)[:top_k]
        avisados = [c for c in candidatos if fila[c] >= umbral]
        correcto = [c for c in avisados if c == verdad[q]]
        vp += len(correcto)
        fp += len(avisados) - len(correcto)
        encontrados += bool(correcto)
    n_dup = int((verdad >= 0).sum())
    return {
        "umbral": round(float(umbral), 3),
        "avisos": vp + fp,
        "correctos": vp,
        "falsos": fp,
        "precision": round(vp / (vp + fp), 4) if vp + fp else None,
        "recall": round(encontrados / n_dup, 4),
    }


def main() -> None:
    os.chdir(AI_SERVICE)
    sys.path.insert(0, str(AI_SERVICE))
    import logging

    logging.disable(logging.INFO)
    from app.main import app  # carga los modelos como en producción
    from app.modelos import cargador_imagen, cargador_texto

    registro = app.state.registro
    if registro.modo != "real" or not registro.modelo_beto:
        raise SystemExit("ai-service no tiene los modelos reales cargados.")
    SALIDA.mkdir(parents=True, exist_ok=True)

    conjuntos = {n: armar_conjunto(n, registro, cargador_imagen, cargador_texto) for n in ("val", "test")}

    umbrales = np.round(np.arange(0.70, 0.991, 0.01), 3)
    resultado = {"n_duplicados_simulados": N_DUPLICADOS, "reglas": {}}
    print("\nRegla                         | umbral | VAL precisión / recall | TEST precisión / recall")
    for nombre_regla in reglas(conjuntos["val"]["sims"]):
        punt_val = reglas(conjuntos["val"]["sims"])[nombre_regla]
        punt_test = reglas(conjuntos["test"]["sims"])[nombre_regla]
        actual_val = medir(punt_val, conjuntos["val"]["verdad"], 0.90)
        actual_test = medir(punt_test, conjuntos["test"]["verdad"], 0.90)
        # Umbral elegido en VALIDACIÓN: el menor que da precisión >= 92 % (margen sobre el 90 %).
        curva = [medir(punt_val, conjuntos["val"]["verdad"], u) for u in umbrales]
        validos = [c for c in curva if c["precision"] is not None and c["precision"] >= 0.92]
        elegido = max(validos, key=lambda c: (c["recall"], -c["umbral"])) if validos else None
        en_test = medir(punt_test, conjuntos["test"]["verdad"], elegido["umbral"]) if elegido else None
        resultado["reglas"][nombre_regla] = {
            "umbral_0_90": {"val": actual_val, "test": actual_test},
            "umbral_elegido_en_val": elegido,
            "test_con_umbral_elegido": en_test,
            "curva_val": curva,
        }
        print(f"{nombre_regla:29s} |  0,90  | {actual_val['precision']} / {actual_val['recall']} | {actual_test['precision']} / {actual_test['recall']}")
        if elegido:
            print(f"{'':29s} |  {elegido['umbral']:.2f}  | {elegido['precision']} / {elegido['recall']} | {en_test['precision']} / {en_test['recall']}")
    resultado["ejemplos_de_copias"] = conjuntos["test"]["ejemplos"]
    (SALIDA / "resumen_duplicados.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDetalle en {SALIDA / 'resumen_duplicados.json'}")


if __name__ == "__main__":
    main()
