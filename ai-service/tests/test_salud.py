def test_health_sin_modelos_responde_modo_demo(cliente_demo):
    respuesta = cliente_demo.get("/health")
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["estado"] == "ok"
    assert cuerpo["modo"] == "demo"
    assert cuerpo["modelos_cargados"] == []


def test_health_no_requiere_api_key(cliente_demo, con_api_key):
    # /health queda público a propósito, aunque haya AI_API_KEY seteada
    # (ver README.md) — un monitor externo debe poder pingearlo sin credenciales.
    respuesta = cliente_demo.get("/health")
    assert respuesta.status_code == 200
