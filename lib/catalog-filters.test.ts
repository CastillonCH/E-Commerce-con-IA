import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  applyCatalogQuery,
  buildCatalogSearch,
  hasActiveFilters,
  marcaFacets,
  paginate,
  parseCatalogQuery,
} from "@/lib/catalog-filters";

function producto(parcial: Partial<Product> & Pick<Product, "id">): Product {
  return {
    nombre: `Producto ${parcial.id}`,
    precio: 100,
    stock: 5,
    marca: "SoundMax",
    departamento: "Electrónica",
    imagen_url: "",
    categoria_ia: "Audio y audífonos",
    ...parcial,
  };
}

const PRODUCTOS: Product[] = [
  producto({ id: "1", precio: 300, marca: "SoundMax", rating: 4.5, numResenas: 10 }),
  producto({ id: "2", precio: 50, marca: "Acme", rating: 3.2, precioOriginal: 100, envioGratis: true }),
  producto({ id: "3", precio: 150, marca: "SoundMax", rating: 4.9, numResenas: 2, esNuevo: true }),
  producto({ id: "4", precio: 90, marca: "Acme", precioOriginal: 100 }),
];

const ids = (lista: Product[]) => lista.map((p) => p.id);

describe("parseCatalogQuery", () => {
  it("sin parámetros devuelve la consulta por defecto", () => {
    expect(parseCatalogQuery({})).toEqual({
      marcas: [],
      precioMin: undefined,
      precioMax: undefined,
      ratingMin: undefined,
      soloOfertas: false,
      envioGratis: false,
      orden: "recomendados",
      page: 1,
    });
  });

  it("lee marcas repetidas, rangos, flags, orden y página", () => {
    const q = parseCatalogQuery({
      marca: ["Acme", "SoundMax", "Acme"],
      min: "40",
      max: "200",
      rating: "4",
      ofertas: "1",
      envio: "1",
      orden: "precio-desc",
      page: "3",
    });
    expect(q).toEqual({
      marcas: ["Acme", "SoundMax"],
      precioMin: 40,
      precioMax: 200,
      ratingMin: 4,
      soloOfertas: true,
      envioGratis: true,
      orden: "precio-desc",
      page: 3,
    });
  });

  it("ignora valores inválidos en vez de romper la página", () => {
    const q = parseCatalogQuery({ min: "abc", max: "-5", rating: "7", orden: "hackeado", page: "-2" });
    expect(q.precioMin).toBeUndefined();
    expect(q.precioMax).toBeUndefined();
    expect(q.ratingMin).toBeUndefined();
    expect(q.orden).toBe("recomendados");
    expect(q.page).toBe(1);
  });
});

describe("buildCatalogSearch", () => {
  it("omite los valores por defecto", () => {
    expect(buildCatalogSearch(parseCatalogQuery({}))).toBe("");
  });

  it("ida y vuelta con parseCatalogQuery", () => {
    const original = parseCatalogQuery({ marca: ["Acme"], min: "10", ofertas: "1", orden: "nuevos" });
    const search = buildCatalogSearch(original);
    const params = new URLSearchParams(search);
    const leido = parseCatalogQuery({
      marca: params.getAll("marca"),
      min: params.get("min") ?? undefined,
      ofertas: params.get("ofertas") ?? undefined,
      orden: params.get("orden") ?? undefined,
    });
    expect(leido).toEqual(original);
  });

  it("cambiar un filtro vuelve a la página 1; pedir una página la conserva", () => {
    const q = parseCatalogQuery({ page: "4" });
    expect(buildCatalogSearch(q, { envioGratis: true })).toBe("?envio=1");
    expect(buildCatalogSearch(q, { page: 2 })).toBe("?page=2");
  });
});

describe("applyCatalogQuery", () => {
  it("filtra por marca sin distinguir mayúsculas", () => {
    expect(ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ marca: "acme" })))).toEqual(["2", "4"]);
  });

  it("filtra por rango de precio, rating, ofertas y envío gratis", () => {
    expect(ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ min: "60", max: "200" })))).toEqual(["3", "4"]);
    expect(ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ rating: "4" })))).toEqual(["1", "3"]);
    expect(ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ ofertas: "1" })))).toEqual(["2", "4"]);
    expect(ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ envio: "1" })))).toEqual(["2"]);
  });

  it("ordena según el criterio elegido", () => {
    const ordenar = (orden: string) => ids(applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ orden })));
    expect(ordenar("recomendados")).toEqual(["1", "2", "3", "4"]);
    expect(ordenar("precio-asc")).toEqual(["2", "4", "3", "1"]);
    expect(ordenar("precio-desc")).toEqual(["1", "3", "4", "2"]);
    expect(ordenar("valorados")).toEqual(["3", "1", "2", "4"]);
    expect(ordenar("descuento")).toEqual(["2", "4", "1", "3"]);
    expect(ordenar("nuevos")).toEqual(["3", "4", "2", "1"]);
  });

  it("no muta el arreglo original", () => {
    const copia = [...PRODUCTOS];
    applyCatalogQuery(PRODUCTOS, parseCatalogQuery({ orden: "precio-asc" }));
    expect(PRODUCTOS).toEqual(copia);
  });
});

describe("marcaFacets / hasActiveFilters / paginate", () => {
  it("cuenta productos por marca, de más a menos", () => {
    expect(marcaFacets([...PRODUCTOS, producto({ id: "5", marca: "Acme" })])).toEqual([
      { marca: "Acme", cantidad: 3 },
      { marca: "SoundMax", cantidad: 2 },
    ]);
  });

  it("el orden y la página no cuentan como filtro activo", () => {
    expect(hasActiveFilters(parseCatalogQuery({ orden: "precio-asc", page: "2" }))).toBe(false);
    expect(hasActiveFilters(parseCatalogQuery({ marca: "Acme" }))).toBe(true);
  });

  it("pagina y acota la página pedida al rango válido", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(items, 2, 12)).toEqual({ items: items.slice(12, 24), currentPage: 2, totalPages: 3 });
    expect(paginate(items, 99, 12).currentPage).toBe(3);
    expect(paginate([], 1, 12)).toEqual({ items: [], currentPage: 1, totalPages: 1 });
  });
});
