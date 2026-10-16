def test_modelos_sin_api_key_configurada_no_exige_header(cliente_demo):
    # Sin AI_API_KEY seteada (el fixture con_api_key no se usó acá), el
    # servicio no exige autenticación — solo para correr en local.
    respuesta = cliente_demo.get("/modelos")
    assert respuesta.status_code == 200


def test_modelos_con_api_key_configurada_rechaza_sin_header(cliente_demo, con_api_key):
    respuesta = cliente_demo.get("/modelos")
    assert respuesta.status_code == 401


def test_modelos_con_api_key_configurada_rechaza_header_incorrecto(cliente_demo, con_api_key):
    respuesta = cliente_demo.get("/modelos", headers={"X-API-Key": "clave-equivocada"})
    assert respuesta.status_code == 401


def test_modelos_con_api_key_configurada_acepta_header_correcto(cliente_demo, con_api_key):
    respuesta = cliente_demo.get("/modelos", headers={"X-API-Key": con_api_key})
    assert respuesta.status_code == 200


def test_clasificar_exige_api_key_cuando_esta_configurada(cliente_demo, con_api_key, imagen_de_prueba_bytes):
    respuesta = cliente_demo.post(
        "/clasificar",
        data={"titulo": "Parlante Bluetooth"},
        files={"imagen": ("foto.jpg", imagen_de_prueba_bytes, "image/jpeg")},
    )
    assert respuesta.status_code == 401
