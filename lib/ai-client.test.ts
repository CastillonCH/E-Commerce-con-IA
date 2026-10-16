import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIServiceError, AIServiceNoConfiguradoError, clasificarProducto, obtenerSaludIA } from "@/lib/ai-client";

function respuestaValida() {
  return {
    modo: "real",
    latencia_ms: 120,
    resultado: {
      indice_clase: 0,
      categoria: "Audio y audífonos",
      confianza: 0.9,
      top_k: [{ indice_clase: 0, categoria: "Audio y audífonos", prob: 0.9 }],
    },
    por_modelo: [],
    embeddings: [],
  };
}

function archivoDePrueba(): File {
  return new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
}

describe("clasificarProducto", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.AI_SERVICE_URL = "http://localhost:9999";
    process.env.AI_API_KEY = "clave-secreta";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
  });

  it("lanza AIServiceNoConfiguradoError si falta AI_SERVICE_URL", async () => {
    delete process.env.AI_SERVICE_URL;
    await expect(
      clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() }),
    ).rejects.toBeInstanceOf(AIServiceNoConfiguradoError);
  });

  it("éxito: manda el header X-API-Key y devuelve la respuesta validada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => respuestaValida(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await clasificarProducto({
      titulo: "Parlante",
      descripcion: "Portátil",
      imagen: archivoDePrueba(),
    });

    expect(resultado.resultado.categoria).toBe("Audio y audífonos");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9999/clasificar",
      expect.objectContaining({
        method: "POST",
        headers: { "X-API-Key": "clave-secreta" },
      }),
    );
  });

  it("no manda X-API-Key si AI_API_KEY no está configurada", async () => {
    delete process.env.AI_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => respuestaValida() });
    vi.stubGlobal("fetch", fetchMock);

    await clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: undefined }),
    );
  });

  it("error HTTP: lanza AIServiceError con el status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "no hay modelos" }),
    );

    await expect(
      clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() }),
    ).rejects.toThrow(/503/);
  });

  it("timeout: lanza AIServiceError mencionando el tiempo de espera", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }),
    );

    await expect(
      clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() }),
    ).rejects.toThrow(/no respondió/);
  });

  it("red caída: lanza AIServiceError genérico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() }),
    ).rejects.toBeInstanceOf(AIServiceError);
  });

  it("respuesta con forma inválida: lanza AIServiceError en vez de propagar el error de Zod crudo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ algo: "inesperado" }) }));

    await expect(
      clasificarProducto({ titulo: "x", descripcion: "y", imagen: archivoDePrueba() }),
    ).rejects.toThrow(/formato esperado/);
  });
});

describe("obtenerSaludIA", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.AI_SERVICE_URL = "http://localhost:9999";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
  });

  it("devuelve null (no lanza) si AI_SERVICE_URL no está configurado", async () => {
    delete process.env.AI_SERVICE_URL;
    expect(await obtenerSaludIA()).toBeNull();
  });

  it("devuelve null (no lanza) si el servicio no responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await obtenerSaludIA()).toBeNull();
  });

  it("devuelve la salud normalizada cuando el servicio responde bien", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ estado: "ok", modo: "demo", modelos_cargados: [] }),
      }),
    );
    const salud = await obtenerSaludIA();
    expect(salud).toEqual({ estado: "ok", modo: "demo", modelosCargados: [] });
  });
});
