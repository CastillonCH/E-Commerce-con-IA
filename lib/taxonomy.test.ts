import { describe, expect, it } from "vitest";
import { DEPARTAMENTOS, CATEGORIAS_IA } from "@/lib/taxonomy";

describe("taxonomy", () => {
  it("cada departamento tiene al menos una categoría de IA", () => {
    for (const departamento of DEPARTAMENTOS) {
      expect(CATEGORIAS_IA[departamento].length).toBeGreaterThan(0);
    }
  });

  it("CATEGORIAS_IA no tiene claves fuera de DEPARTAMENTOS", () => {
    const keys = Object.keys(CATEGORIAS_IA);
    expect(keys.sort()).toEqual([...DEPARTAMENTOS].sort());
  });
});
