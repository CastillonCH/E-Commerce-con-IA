import { describe, expect, it } from "vitest";
import {
  DEPARTAMENTOS,
  CATEGORIAS_IA,
  slugify,
  departamentoFromSlug,
  categoriaFromSlug,
  catalogoHref,
} from "@/lib/taxonomy";

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

describe("slugs del catálogo", () => {
  it("coinciden con los slugs de la base", () => {
    expect(slugify("Electrónica")).toBe("electronica");
    expect(slugify("Audio y audífonos")).toBe("audio-y-audifonos");
    expect(slugify("Vehículos de juguete")).toBe("vehiculos-de-juguete");
  });

  it("ida y vuelta: cada departamento y categoría se recupera desde su slug", () => {
    for (const departamento of DEPARTAMENTOS) {
      expect(departamentoFromSlug(slugify(departamento))).toBe(departamento);
      for (const categoria of CATEGORIAS_IA[departamento]) {
        expect(categoriaFromSlug(departamento, slugify(categoria))).toBe(categoria);
      }
    }
  });

  it("slugs desconocidos o de otro departamento devuelven null", () => {
    expect(departamentoFromSlug("ropa")).toBeNull();
    expect(categoriaFromSlug("Moda", "balones")).toBeNull();
  });

  it("catalogoHref arma la ruta del departamento y de la categoría", () => {
    expect(catalogoHref("Electrónica")).toBe("/categoria/electronica");
    expect(catalogoHref("Electrónica", "Audio y audífonos")).toBe(
      "/categoria/electronica/audio-y-audifonos",
    );
  });
});
