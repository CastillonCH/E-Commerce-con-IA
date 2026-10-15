import { describe, expect, it } from "vitest";
import { similarity } from "@/lib/similarity";

describe("similarity", () => {
  it("devuelve 1 para strings idénticos (ignorando mayúsculas y espacios)", () => {
    expect(similarity("Audífonos Pro", "  audífonos pro ")).toBe(1);
  });

  it("devuelve un valor alto para nombres casi iguales", () => {
    expect(similarity("Audífonos Inalámbricos Pro", "Audifonos Inalambricos Pro")).toBeGreaterThan(0.85);
  });

  it("devuelve un valor bajo para nombres muy distintos", () => {
    expect(similarity("Audífonos Inalámbricos Pro", "Sofá Modular 3 Cuerpos")).toBeLessThan(0.3);
  });

  it("maneja strings vacíos sin lanzar", () => {
    expect(similarity("", "")).toBe(1);
    expect(similarity("algo", "")).toBe(0);
  });
});
