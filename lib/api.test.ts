import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { getApiErrorMessage } from "@/lib/api";

describe("getApiErrorMessage", () => {
  it("usa el `detail` del backend cuando el error viene de axios", () => {
    const error = new AxiosError("Request failed");
    error.response = {
      data: { detail: "Stock insuficiente" },
      status: 400,
      statusText: "Bad Request",
      headers: {},
      // @ts-expect-error -- config no es relevante para este test
      config: {},
    };
    expect(getApiErrorMessage(error)).toBe("Stock insuficiente");
  });

  it("usa un mensaje genérico si el error de axios no trae `detail`", () => {
    const error = new AxiosError("Network Error");
    expect(getApiErrorMessage(error)).toBe(
      "No se pudo conectar con el servidor. Intenta de nuevo.",
    );
  });

  it("usa un mensaje genérico para errores que no son de axios", () => {
    expect(getApiErrorMessage(new Error("algo explotó"))).toBe(
      "Ocurrió un error inesperado.",
    );
    expect(getApiErrorMessage("un string cualquiera")).toBe(
      "Ocurrió un error inesperado.",
    );
  });
});
