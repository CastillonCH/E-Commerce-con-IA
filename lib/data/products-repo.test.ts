import { describe, expect, it } from "vitest";
import {
  listProducts,
  getProductById,
  listOfertas,
  listNuevos,
  listRelacionados,
  listByMarca,
  addProduct,
  updateProductRecord,
  removeProduct,
  addPendingReview,
  listPendingReview,
  approvePendingReview,
  rejectPendingReview,
  listPossibleDuplicates,
  REVIEW_THRESHOLD,
} from "@/lib/data/products-repo";
import type { Product } from "@/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    nombre: "Producto de prueba",
    precio: 99.9,
    stock: 5,
    marca: "TestBrand",
    departamento: "Electrónica",
    imagen_url: "https://example.com/img.jpg",
    categoria_ia: "Audio y audífonos",
    ...overrides,
  };
}

describe("listProducts", () => {
  it("devuelve productos del catálogo semilla", async () => {
    const products = await listProducts();
    expect(products.length).toBeGreaterThan(0);
  });

  it("filtra por texto en nombre o marca", async () => {
    const products = await listProducts({ q: "audífonos" });
    expect(products.every((p) =>
      p.nombre.toLowerCase().includes("audífonos") ||
      p.marca.toLowerCase().includes("audífonos"),
    )).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  it("filtra por departamento", async () => {
    const products = await listProducts({ departamento: "Moda" });
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.departamento === "Moda")).toBe(true);
  });

  it("filtra por soloNuevos", async () => {
    const products = await listProducts({ soloNuevos: true });
    expect(products.every((p) => p.esNuevo)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });
});

describe("getProductById", () => {
  it("encuentra un producto existente", async () => {
    const product = await getProductById("1");
    expect(product?.id).toBe("1");
  });

  it("devuelve null para un id inexistente", async () => {
    expect(await getProductById("no-existe")).toBeNull();
  });
});

describe("listOfertas / listNuevos / listRelacionados", () => {
  it("listOfertas solo incluye productos con descuento real", async () => {
    const ofertas = await listOfertas();
    expect(
      ofertas.every((p) => p.precioOriginal && p.precioOriginal > p.precio),
    ).toBe(true);
  });

  it("listNuevos solo incluye productos marcados esNuevo", async () => {
    const nuevos = await listNuevos();
    expect(nuevos.every((p) => p.esNuevo)).toBe(true);
  });

  it("listRelacionados excluye al propio producto y filtra por departamento", async () => {
    const product = await getProductById("1");
    const relacionados = await listRelacionados(product!);
    expect(relacionados.some((p) => p.id === product!.id)).toBe(false);
    expect(relacionados.every((p) => p.departamento === product!.departamento)).toBe(true);
  });
});

describe("listByMarca", () => {
  it("filtra sin distinguir mayúsculas/minúsculas", async () => {
    const products = await listByMarca("soundmax");
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.marca.toLowerCase() === "soundmax")).toBe(true);
  });
});

describe("mutadores directos", () => {
  it("addProduct agrega y getProductById lo encuentra después", async () => {
    const product = makeProduct();
    await addProduct(product);
    expect(await getProductById(product.id)).toEqual(product);
  });

  it("updateProductRecord aplica un patch parcial", async () => {
    const product = makeProduct();
    await addProduct(product);
    const updated = await updateProductRecord(product.id, { stock: 1 });
    expect(updated?.stock).toBe(1);
    expect(updated?.nombre).toBe(product.nombre);
  });

  it("updateProductRecord devuelve null para un id inexistente", async () => {
    expect(await updateProductRecord("no-existe", { stock: 1 })).toBeNull();
  });

  it("removeProduct elimina el producto y devuelve true", async () => {
    const product = makeProduct();
    await addProduct(product);
    expect(await removeProduct(product.id)).toBe(true);
    expect(await getProductById(product.id)).toBeNull();
  });

  it("removeProduct devuelve false para un id inexistente", async () => {
    expect(await removeProduct("no-existe")).toBe(false);
  });
});

describe("cola de revisión de IA", () => {
  it("un producto agregado a revisión no aparece en el catálogo hasta aprobarse", async () => {
    const product = makeProduct({ categoria_ia: "Laptops y computadoras" });
    await addPendingReview(product, 0.5);

    expect(await getProductById(product.id)).toBeNull();
    const pending = await listPendingReview();
    expect(pending.some((entry) => entry.product.id === product.id)).toBe(true);
  });

  it("approvePendingReview publica el producto y permite corregir la categoría", async () => {
    const product = makeProduct({ categoria_ia: "Laptops y computadoras" });
    await addPendingReview(product, 0.4);

    const approved = await approvePendingReview(product.id, "Muebles");
    expect(approved?.categoria_ia).toBe("Muebles");
    expect(await getProductById(product.id)).not.toBeNull();

    const pending = await listPendingReview();
    expect(pending.some((entry) => entry.product.id === product.id)).toBe(false);
  });

  it("rejectPendingReview descarta el producto sin publicarlo", async () => {
    const product = makeProduct();
    await addPendingReview(product, 0.3);

    expect(await rejectPendingReview(product.id)).toBe(true);
    expect(await getProductById(product.id)).toBeNull();
    const pending = await listPendingReview();
    expect(pending.some((entry) => entry.product.id === product.id)).toBe(false);
  });

  it("approvePendingReview/rejectPendingReview devuelven null/false para un id que no está en revisión", async () => {
    expect(await approvePendingReview("no-existe")).toBeNull();
    expect(await rejectPendingReview("no-existe")).toBe(false);
  });

  it("REVIEW_THRESHOLD está entre 0 y 1", () => {
    expect(REVIEW_THRESHOLD).toBeGreaterThan(0);
    expect(REVIEW_THRESHOLD).toBeLessThan(1);
  });
});

describe("listPossibleDuplicates", () => {
  it("detecta dos productos de la misma marca con nombres casi idénticos", async () => {
    const a = makeProduct({ marca: "DupBrand", nombre: "Mochila Escolar Azul" });
    const b = makeProduct({ marca: "DupBrand", nombre: "Mochila escolar azul" });
    await addProduct(a);
    await addProduct(b);

    const duplicates = await listPossibleDuplicates();
    expect(
      duplicates.some(
        (pair) =>
          (pair.a.id === a.id && pair.b.id === b.id) ||
          (pair.a.id === b.id && pair.b.id === a.id),
      ),
    ).toBe(true);
  });

  it("no compara productos de marcas distintas", async () => {
    const a = makeProduct({ marca: "MarcaUno", nombre: "Producto Único XYZ" });
    const b = makeProduct({ marca: "MarcaDos", nombre: "Producto Único XYZ" });
    await addProduct(a);
    await addProduct(b);

    const duplicates = await listPossibleDuplicates();
    expect(
      duplicates.some(
        (pair) =>
          (pair.a.id === a.id && pair.b.id === b.id) ||
          (pair.a.id === b.id && pair.b.id === a.id),
      ),
    ).toBe(false);
  });
});
