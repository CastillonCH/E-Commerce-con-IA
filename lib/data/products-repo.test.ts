import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/db";
import {
  listProducts,
  getProductById,
  listOfertas,
  listNuevos,
  listRelacionados,
  listByMarca,
  updateProductRecord,
  removeProduct,
  createProductFromAI,
  listPendingReview,
  approvePendingReview,
  rejectPendingReview,
  listPossibleDuplicates,
  REVIEW_THRESHOLD,
} from "@/lib/data/products-repo";

describe.skipIf(!process.env.DATABASE_URL)(
  "products-repo (integración con PostgreSQL)",
  () => {
    afterAll(async () => {
      await closePool();
    });

    describe("listProducts", () => {
      it("devuelve los 22 productos semilla publicados", async () => {
        const products = await listProducts();
        expect(products.length).toBe(22);
      });

      it("filtra por texto sin distinguir tildes (audifonos -> audífonos)", async () => {
        const products = await listProducts({ q: "audifonos" });
        expect(products.some((p) => p.nombre === "Audífonos Inalámbricos Pro")).toBe(true);
      });

      it("filtra por departamento", async () => {
        const products = await listProducts({ departamento: "Moda" });
        expect(products.length).toBeGreaterThan(0);
        expect(products.every((p) => p.departamento === "Moda")).toBe(true);
      });

      it("filtra por soloNuevos", async () => {
        const products = await listProducts({ soloNuevos: true });
        expect(products.length).toBeGreaterThan(0);
        expect(products.every((p) => p.esNuevo)).toBe(true);
      });
    });

    describe("getProductById / listOfertas / listNuevos / listRelacionados", () => {
      it("encuentra el producto 1 con sus campos reales", async () => {
        const product = await getProductById("1");
        expect(product?.nombre).toBe("Audífonos Inalámbricos Pro");
        expect(product?.marca).toBe("SoundMax");
        expect(product?.categoria_ia).toBe("Audio y audífonos");
        expect(product?.imagen_url).toMatch(/^https:\/\//);
      });

      it("devuelve null para un id inexistente", async () => {
        expect(await getProductById("99999")).toBeNull();
      });

      it("listOfertas solo incluye productos con descuento real", async () => {
        const ofertas = await listOfertas();
        expect(ofertas.length).toBeGreaterThan(0);
        expect(
          ofertas.every((p) => p.precioOriginal !== undefined && p.precioOriginal > p.precio),
        ).toBe(true);
      });

      it("listNuevos solo incluye productos marcados esNuevo", async () => {
        const nuevos = await listNuevos();
        expect(nuevos.length).toBeGreaterThan(0);
        expect(nuevos.every((p) => p.esNuevo)).toBe(true);
      });

      it("listRelacionados excluye al propio producto y filtra por departamento", async () => {
        const product = await getProductById("1");
        const relacionados = await listRelacionados(product!);
        expect(relacionados.some((p) => p.id === "1")).toBe(false);
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

    describe("updateProductRecord / removeProduct", () => {
      it("actualiza nombre, precio y stock de un producto publicado", async () => {
        const updated = await updateProductRecord("2", {
          nombre: "Licuadora Editada",
          precio: 199.9,
          stock: 10,
        });
        expect(updated?.nombre).toBe("Licuadora Editada");
        expect(updated?.precio).toBe(199.9);
        expect(updated?.stock).toBe(10);
      });

      it("devuelve null para un id inexistente", async () => {
        expect(await updateProductRecord("99999", { stock: 1 })).toBeNull();
      });

      it("pasa el producto a inactivo y deja de verse en el catálogo", async () => {
        expect(await removeProduct("3")).toBe(true);
        expect(await getProductById("3")).toBeNull();
      });

      it("devuelve false para un producto ya inactivo o inexistente", async () => {
        expect(await removeProduct("3")).toBe(false);
        expect(await removeProduct("99999")).toBe(false);
      });
    });

    describe("createProductFromAI / cola de revisión", () => {
      it("rechaza crear un producto para una marca sin vendedor aprobado", async () => {
        await expect(
          createProductFromAI({
            nombre: "Producto sin marca",
            marca: "MarcaInexistente",
            departamento: "Electrónica",
            precio: 10,
            stock: 1,
            imagenUrl: "https://example.com/x.jpg",
            categoriaPredichaNombre: "Audio y audífonos",
            confianza: 0.9,
          }),
        ).rejects.toThrow(/vendedor aprobado/);
      });

      it("con confianza alta publica el producto de inmediato", async () => {
        const result = await createProductFromAI({
          nombre: "Parlante Bluetooth Portátil",
          marca: "SoundMax",
          departamento: "Electrónica",
          precio: 129.9,
          stock: 20,
          imagenUrl: "https://example.com/parlante.jpg",
          categoriaPredichaNombre: "Audio y audífonos",
          confianza: 0.95,
        });
        expect(result.pendingReview).toBe(false);
        expect(result.product?.nombre).toBe("Parlante Bluetooth Portátil");
        expect(result.product?.categoria_ia).toBe("Audio y audífonos");
      });

      it("con confianza baja queda pendiente de revisión y un admin puede aprobarla", async () => {
        const result = await createProductFromAI({
          nombre: "Gorra Deportiva Ajustable",
          marca: "ProSport",
          departamento: "Deportes",
          precio: 39.9,
          stock: 15,
          imagenUrl: "https://example.com/gorra.jpg",
          categoriaPredichaNombre: "Ropa deportiva",
          confianza: 0.4,
        });
        expect(result.pendingReview).toBe(true);
        expect(result.product).toBeNull();

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Gorra Deportiva Ajustable");
        expect(entry).toBeDefined();
        expect(entry!.aiAccuracy).toBe(0.4);
        expect(entry!.product.categoria_ia).toBe("Ropa deportiva");

        const approved = await approvePendingReview(entry!.product.id, "catalogo@novastore.pe");
        expect(approved?.categoria_ia).toBe("Ropa deportiva");
        expect(await getProductById(entry!.product.id)).not.toBeNull();
      });

      it("un admin puede corregir la categoría sugerida al aprobar", async () => {
        await createProductFromAI({
          nombre: "Casaca Deportiva Impermeable",
          marca: "ProSport",
          departamento: "Deportes",
          precio: 89.9,
          stock: 10,
          imagenUrl: "https://example.com/casaca.jpg",
          categoriaPredichaNombre: "Balones",
          confianza: 0.3,
        });
        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Casaca Deportiva Impermeable")!;

        const approved = await approvePendingReview(
          entry.product.id,
          "catalogo@novastore.pe",
          "Equipos de fitness",
        );
        expect(approved?.categoria_ia).toBe("Equipos de fitness");
      });

      it("rejectPendingReview descarta el producto sin publicarlo", async () => {
        await createProductFromAI({
          nombre: "Producto a Rechazar",
          marca: "KidsWorld",
          departamento: "Juguetes",
          precio: 19.9,
          stock: 5,
          imagenUrl: "https://example.com/rechazo.jpg",
          categoriaPredichaNombre: "Peluches",
          confianza: 0.2,
        });
        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Producto a Rechazar")!;

        expect(await rejectPendingReview(entry.product.id)).toBe(true);
        expect(await getProductById(entry.product.id)).toBeNull();
        const pendingAfter = await listPendingReview();
        expect(pendingAfter.some((p) => p.product.id === entry.product.id)).toBe(false);
      });

      it("REVIEW_THRESHOLD está entre 0 y 1", () => {
        expect(REVIEW_THRESHOLD).toBeGreaterThan(0);
        expect(REVIEW_THRESHOLD).toBeLessThan(1);
      });
    });

    describe("listPossibleDuplicates", () => {
      it("detecta dos productos de la misma marca con nombres casi idénticos", async () => {
        await createProductFromAI({
          nombre: "Mochila Escolar Azul",
          marca: "UrbanWear",
          departamento: "Moda",
          precio: 59.9,
          stock: 10,
          imagenUrl: "https://example.com/mochila1.jpg",
          categoriaPredichaNombre: "Polos y camisas",
          confianza: 0.95,
        });
        await createProductFromAI({
          nombre: "Mochila escolar azul",
          marca: "UrbanWear",
          departamento: "Moda",
          precio: 59.9,
          stock: 10,
          imagenUrl: "https://example.com/mochila2.jpg",
          categoriaPredichaNombre: "Polos y camisas",
          confianza: 0.95,
        });

        const duplicates = await listPossibleDuplicates();
        expect(
          duplicates.some(
            (pair) =>
              pair.a.nombre.toLowerCase() === "mochila escolar azul" &&
              pair.b.nombre.toLowerCase() === "mochila escolar azul",
          ),
        ).toBe(true);
      });
    });
  },
);
