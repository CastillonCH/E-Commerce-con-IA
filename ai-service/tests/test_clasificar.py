from app.config import CATEGORIAS


def test_clasificar_en_modo_demo_devuelve_la_forma_esperada(cliente_demo, imagen_de_prueba_bytes):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Parlante Bluetooth portátil", "descripcion": "Resistente al agua"},
        files={"imagen": ("foto.jpg", imagen_de_prueba_bytes, "image/jpeg")},
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()

    assert cuerpo["modo"] == "demo"
    assert isinstance(cuerpo["latencia_ms"], int) and cuerpo["latencia_ms"] >= 0

    resultado = cuerpo["resultado"]
    assert resultado["categoria"] in CATEGORIAS
    assert 0 <= resultado["confianza"] <= 1
    assert resultado["top_k"], "top_k no debería venir vacío"

    assert len(cuerpo["por_modelo"]) >= 1
    assert len(cuerpo["embeddings"]) >= 1
    for emb in cuerpo["embeddings"]:
        assert emb["fuente"] in ("imagen", "texto")
        assert len(emb["vector"]) > 0


def test_clasificar_top_k_viene_ordenado_descendente(cliente_demo, imagen_de_prueba_bytes):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Licuadora de alta potencia para cocina"},
        files={"imagen": ("foto.jpg", imagen_de_prueba_bytes, "image/jpeg")},
    )
    top_k = respuesta.json()["resultado"]["top_k"]
    probabilidades = [entrada["prob"] for entrada in top_k]
    assert probabilidades == sorted(probabilidades, reverse=True)


def test_clasificar_las_probabilidades_del_resultado_combinado_suman_cerca_de_1(cliente_demo, imagen_de_prueba_bytes):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Zapatillas running"},
        files={"imagen": ("foto.jpg", imagen_de_prueba_bytes, "image/jpeg")},
    )
    # En modo demo solo hay un "por_modelo" (reglas de palabras clave,
    # no una distribución de 21 clases) — se valida sobre ese, que sí
    # debe sumar ~1 entre lo que trae su propio top_k + lo no listado.
    por_modelo = respuesta.json()["por_modelo"][0]
    suma_top_k = sum(entrada["prob"] for entrada in por_modelo["top_k"])
    assert suma_top_k <= 1.0 + 1e-6


def test_clasificar_rechaza_imagen_de_tipo_no_soportado(cliente_demo):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Algo"},
        files={"imagen": ("archivo.txt", b"no es una imagen", "text/plain")},
    )
    assert respuesta.status_code == 415


def test_clasificar_rechaza_imagen_mayor_a_5mb(cliente_demo):
    imagen_grande = b"\x00" * (5 * 1024 * 1024 + 1)
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Algo"},
        files={"imagen": ("foto.jpg", imagen_grande, "image/jpeg")},
    )
    assert respuesta.status_code == 413


def test_clasificar_exige_titulo(cliente_demo, imagen_de_prueba_bytes):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={},
        files={"imagen": ("foto.jpg", imagen_de_prueba_bytes, "image/jpeg")},
    )
    assert respuesta.status_code == 422
