import { afterAll, afterEach, describe, expect, it } from "vitest";
import { closePool } from "@/lib/db";
import type { ClasificarResponse } from "@/lib/ai-client";
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
  reclassifyProduct,
  listPendingReview,
  approvePendingReview,
  rejectPendingReview,
  listPossibleDuplicates,
  listDetectedDuplicates,
  resolveDuplicate,
  detectarYRegistrarDuplicados,
  getCategoriaVendedorNombre,
} from "@/lib/data/products-repo";

// Construye una respuesta de ai-service mínima pero completa — el mismo
// contrato que valida lib/ai-client.ts (ClasificarResponseSchema). Usarla
// en vez de pegar el objeto literal en cada test evita que un campo
// obligatorio quede desalineado entre tests sin que nadie lo note.
// La similitud de coseno de pgvector solo mira la DIRECCIÓN del vector, no
// su magnitud — un vector uniforme como Array(n).fill(0.01) y otro
// Array(n).fill(0.5) apuntan exactamente a la misma dirección (similitud
// 1.0), así que dos llamadas sin relación entre sí con un vector "de
// relleno" fijo colisionarían como si fueran duplicados (se detectó así:
// CI con pgvector real hizo que el test de CU5 fallara porque el producto
// "distinto" de la pareja casi idéntica quedaba opacado por todos los
// demás productos del archivo que comparten el mismo vector de relleno
// por defecto). Un vector aleatorio por llamada evita esa colisión.
function vectorAleatorio(dimension: number): number[] {
  return Array.from({ length: dimension }, () => Math.random());
}

function clasificacionFalsa(opciones: {
  categoria: string;
  confianza: number;
  modo?: "real" | "demo";
  codigoModeloImagen?: string;
  codigoModeloTexto?: string;
}): ClasificarResponse {
  const modo = opciones.modo ?? "real";
  const porModelo =
    modo === "demo"
      ? [
          {
            codigo_modelo: "demo",
            tipo: "texto" as const,
            indice_clase: 0,
            categoria: opciones.categoria,
            confianza: opciones.confianza,
            top_k: [{ indice_clase: 0, categoria: opciones.categoria, prob: opciones.confianza }],
          },
        ]
      : [
          {
            codigo_modelo: opciones.codigoModeloImagen ?? "cu1-resnet50-v1",
            tipo: "imagen" as const,
            indice_clase: 0,
            categoria: opciones.categoria,
            confianza: opciones.confianza,
            top_k: [{ indice_clase: 0, categoria: opciones.categoria, prob: opciones.confianza }],
          },
          {
            codigo_modelo: opciones.codigoModeloTexto ?? "cu2-beto-v1",
            tipo: "texto" as const,
            indice_clase: 0,
            categoria: opciones.categoria,
            confianza: opciones.confianza,
            top_k: [{ indice_clase: 0, categoria: opciones.categoria, prob: opciones.confianza }],
          },
        ];

  const embeddings =
    modo === "demo"
      ? []
      : [
          { codigo_modelo: opciones.codigoModeloImagen ?? "cu1-resnet50-v1", fuente: "imagen" as const, vector: vectorAleatorio(2048) },
          { codigo_modelo: opciones.codigoModeloTexto ?? "cu2-beto-v1", fuente: "texto" as const, vector: vectorAleatorio(768) },
        ];

  return {
    modo,
    latencia_ms: 120,
    resultado: {
      indice_clase: 0,
      categoria: opciones.categoria,
      confianza: opciones.confianza,
      top_k: [{ indice_clase: 0, categoria: opciones.categoria, prob: opciones.confianza }],
    },
    por_modelo: porModelo,
    embeddings,
  };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "products-repo (integración con PostgreSQL)",
  () => {
    const envOriginal = { ...process.env };

    afterEach(() => {
      // OJO: `process.env.X = undefined` en vez de borrar la clave la deja
      // como la STRING "undefined" (process.env solo guarda strings) — eso
      // rompe la próxima llamada a getServerEnv() con un error de Zod
      // críptico. Hay que borrar la clave de verdad si no tenía valor.
      if (envOriginal.REVIEW_POLICY === undefined) delete process.env.REVIEW_POLICY;
      else process.env.REVIEW_POLICY = envOriginal.REVIEW_POLICY;

      if (envOriginal.REVIEW_THRESHOLD === undefined) delete process.env.REVIEW_THRESHOLD;
      else process.env.REVIEW_THRESHOLD = envOriginal.REVIEW_THRESHOLD;
    });

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
      it("actualiza nombre, descripción, precio y stock de un producto publicado", async () => {
        const updated = await updateProductRecord("2", {
          nombre: "Licuadora Editada",
          descripcion: "Nueva descripción de al menos veinte caracteres.",
          precio: 199.9,
          stock: 10,
        });
        expect(updated?.nombre).toBe("Licuadora Editada");
        expect(updated?.descripcion).toBe("Nueva descripción de al menos veinte caracteres.");
        expect(updated?.precio).toBe(199.9);
        expect(updated?.stock).toBe(10);
      });

      it("actualiza la categoría del vendedor solo cuando viene junto con el departamento", async () => {
        await updateProductRecord("2", { departamento: "Hogar", categoriaVendedor: "Muebles" });
        expect(await getCategoriaVendedorNombre("2")).toBe("Muebles");
      });

      it("rechaza una categoría que no pertenece al departamento enviado", async () => {
        await expect(
          updateProductRecord("2", { departamento: "Hogar", categoriaVendedor: "Audio y audífonos" }),
        ).rejects.toThrow(/no pertenece al departamento/);
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

    describe("createProductFromAI — sin clasificación (servicio de IA caído)", () => {
      it("rechaza crear un producto para una marca sin vendedor aprobado", async () => {
        await expect(
          createProductFromAI({
            nombre: "Producto sin marca",
            descripcion: "Una descripción cualquiera de más de veinte caracteres.",
            marca: "MarcaInexistente",
            departamento: "Electrónica",
            categoriaVendedorNombre: "Audio y audífonos",
            precio: 10,
            stock: 1,
            imagenUrl: "https://example.com/x.jpg",
            clasificacion: null,
          }),
        ).rejects.toThrow(/vendedor aprobado/);
      });

      it("nunca bloquea al vendedor: sin clasificación, el producto se guarda igual en revisión, sin predicción", async () => {
        const result = await createProductFromAI({
          nombre: "Producto Sin IA Disponible",
          descripcion: "El servicio de IA no respondió para este producto de prueba.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 49.9,
          stock: 5,
          imagenUrl: "https://example.com/sin-ia.jpg",
          clasificacion: null,
        });
        expect(result.pendingReview).toBe(true);
        expect(result.product).toBeNull();

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Producto Sin IA Disponible");
        expect(entry).toBeDefined();
        expect(entry!.confidence).toBe(0); // sin predicción -> sin confianza
        expect(entry!.product.categoria_ia).toBe("Sin categoría sugerida");
      });
    });

    describe("createProductFromAI — REVIEW_POLICY='umbral'", () => {
      it("con confianza >= REVIEW_THRESHOLD publica el producto de inmediato", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";

        const result = await createProductFromAI({
          nombre: "Parlante Bluetooth Portátil",
          descripcion: "Parlante resistente al agua con doce horas de batería.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 129.9,
          stock: 20,
          imagenUrl: "https://example.com/parlante.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.95 }),
        });
        expect(result.pendingReview).toBe(false);
        expect(result.product?.nombre).toBe("Parlante Bluetooth Portátil");
        expect(result.product?.categoria_ia).toBe("Audio y audífonos");
      });

      it("con confianza baja queda pendiente de revisión y un admin puede aprobarla", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";

        const result = await createProductFromAI({
          nombre: "Gorra Deportiva Ajustable",
          descripcion: "Gorra ajustable para hacer deporte al aire libre.",
          marca: "ProSport",
          departamento: "Deportes",
          categoriaVendedorNombre: "Ropa deportiva",
          precio: 39.9,
          stock: 15,
          imagenUrl: "https://example.com/gorra.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Ropa deportiva", confianza: 0.4 }),
        });
        expect(result.pendingReview).toBe(true);
        expect(result.product).toBeNull();

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Gorra Deportiva Ajustable");
        expect(entry).toBeDefined();
        expect(entry!.confidence).toBe(0.4);
        expect(entry!.product.categoria_ia).toBe("Ropa deportiva");

        const approved = await approvePendingReview(entry!.product.id, "catalogo@novastore.pe", undefined, 42);
        expect(approved?.categoria_ia).toBe("Ropa deportiva");
        expect(await getProductById(entry!.product.id)).not.toBeNull();
      });

      it("un admin puede corregir la categoría sugerida al aprobar", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";

        await createProductFromAI({
          nombre: "Casaca Deportiva Impermeable",
          descripcion: "Casaca impermeable pensada para trote y ciclismo.",
          marca: "ProSport",
          departamento: "Deportes",
          categoriaVendedorNombre: "Ropa deportiva",
          precio: 89.9,
          stock: 10,
          imagenUrl: "https://example.com/casaca.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Balones", confianza: 0.3 }),
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

      it("no publica directo si la categoría sugerida no pertenece al departamento del producto", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.5";

        // "Audio y audífonos" es de Electrónica, el producto es de Hogar —
        // publicar directo violaría fk_productos_categoria_depto.
        const result = await createProductFromAI({
          nombre: "Juego de Sábanas Premium",
          descripcion: "Sábanas suaves de algodón para cama queen size.",
          marca: "HogarPlus",
          departamento: "Hogar",
          categoriaVendedorNombre: "Decoración y menaje",
          precio: 79.9,
          stock: 8,
          imagenUrl: "https://example.com/sabanas.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.99 }),
        });
        expect(result.pendingReview).toBe(true);
      });

      it("rejectPendingReview descarta el producto sin publicarlo", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";

        await createProductFromAI({
          nombre: "Producto a Rechazar",
          descripcion: "Este producto se va a rechazar en el test, a propósito.",
          marca: "KidsWorld",
          departamento: "Juguetes",
          categoriaVendedorNombre: "Peluches",
          precio: 19.9,
          stock: 5,
          imagenUrl: "https://example.com/rechazo.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Peluches", confianza: 0.2 }),
        });
        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Producto a Rechazar")!;

        expect(await rejectPendingReview(entry.product.id)).toBe(true);
        expect(await getProductById(entry.product.id)).toBeNull();
        const pendingAfter = await listPendingReview();
        expect(pendingAfter.some((p) => p.product.id === entry.product.id)).toBe(false);
      });
    });

    describe("createProductFromAI — REVIEW_POLICY='todos' (comportamiento por defecto)", () => {
      it("siempre queda en revisión, incluso con confianza altísima", async () => {
        process.env.REVIEW_POLICY = "todos";

        const result = await createProductFromAI({
          nombre: "Audífonos de Confianza Altísima",
          descripcion: "Un producto con confianza de IA muy alta, igual debe revisarse.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 199.9,
          stock: 10,
          imagenUrl: "https://example.com/audifonos-alta.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.99 }),
        });
        expect(result.pendingReview).toBe(true);
      });
    });

    describe("predicciones_ia por modelo (modo real) vs. sin persistir (modo demo)", () => {
      it("en modo real, guarda una fila de predicciones_ia por cada modelo de por_modelo", async () => {
        process.env.REVIEW_POLICY = "todos";

        const result = await createProductFromAI({
          nombre: "Producto Con Dos Modelos",
          descripcion: "Para comprobar que se guarda una predicción por modelo.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 59.9,
          stock: 3,
          imagenUrl: "https://example.com/dos-modelos.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.8 }),
        });

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.id === result.productId);
        // La fila que muestra listPendingReview es la de mayor confianza
        // entre los modelos — acá ambos modelos de prueba tienen la misma
        // confianza (0.8), así que debe aparecer esa.
        expect(entry?.confidence).toBe(0.8);
      });

      it("en modo demo, NO guarda predicciones_ia (el modelo 'demo' no existe en modelos_ia)", async () => {
        process.env.REVIEW_POLICY = "todos";

        const result = await createProductFromAI({
          nombre: "Producto En Modo Demo",
          descripcion: "Clasificado solo con reglas de palabras clave, sin modelo real.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 29.9,
          stock: 7,
          imagenUrl: "https://example.com/demo.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.4, modo: "demo" }),
        });

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.id === result.productId);
        // Sin predicciones_ia, listPendingReview no tiene de dónde sacar
        // una categoría/confianza sugerida.
        expect(entry?.confidence).toBe(0);
        expect(entry?.product.categoria_ia).toBe("Sin categoría sugerida");
      });
    });

    describe("listPossibleDuplicates (respaldo sin IA, Levenshtein)", () => {
      it("detecta dos productos de la misma marca con nombres casi idénticos", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        // listPossibleDuplicates solo mira el catálogo PUBLICADO
        // (v_productos_tienda) — hay que publicar de verdad, no alcanza con
        // crearlos. modo "demo" (no persiste predicciones_ia/embeddings)
        // para no depender de producto_embeddings/pgvector en este test.
        const publicada = (categoria: string) =>
          clasificacionFalsa({ categoria, confianza: 0.95, modo: "demo" });

        await createProductFromAI({
          nombre: "Mochila Escolar Azul",
          descripcion: "Mochila resistente para el colegio, color azul.",
          marca: "UrbanWear",
          departamento: "Moda",
          categoriaVendedorNombre: "Polos y camisas",
          precio: 59.9,
          stock: 10,
          imagenUrl: "https://example.com/mochila1.jpg",
          clasificacion: publicada("Polos y camisas"),
        });
        await createProductFromAI({
          nombre: "Mochila escolar azul",
          descripcion: "Mochila resistente para el colegio, de color azul.",
          marca: "UrbanWear",
          departamento: "Moda",
          categoriaVendedorNombre: "Polos y camisas",
          precio: 59.9,
          stock: 10,
          imagenUrl: "https://example.com/mochila2.jpg",
          clasificacion: publicada("Polos y camisas"),
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

    describe("CU5 — duplicados por embeddings (fn_buscar_duplicados, pgvector)", () => {
      it("detecta y registra un par casi idéntico, y un admin puede confirmarlo/descartarlo", async () => {
        process.env.REVIEW_POLICY = "todos";
        const vectorBase = vectorAleatorio(2048);
        const vectorCasiIgual = vectorBase.map((v) => v + 0.0001);
        const clasificacionA = clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.9 });
        clasificacionA.embeddings[0].vector = vectorBase;
        const clasificacionB = clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.9 });
        clasificacionB.embeddings[0].vector = vectorCasiIgual;

        const a = await createProductFromAI({
          nombre: "Parlante Portátil XZ1",
          descripcion: "Primer parlante de la pareja casi idéntica para CU5.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 99.9,
          stock: 5,
          imagenUrl: "https://example.com/xz1-a.jpg",
          clasificacion: clasificacionA,
        });
        const b = await createProductFromAI({
          nombre: "Parlante Portátil XZ1 Pro",
          descripcion: "Segundo parlante de la pareja casi idéntica para CU5.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 99.9,
          stock: 5,
          imagenUrl: "https://example.com/xz1-b.jpg",
          clasificacion: clasificacionB,
        });

        const detectados = await detectarYRegistrarDuplicados(b.productId, 0.9);
        expect(detectados.some((d) => d.productoId === a.productId)).toBe(true);

        const listados = await listDetectedDuplicates();
        const par = listados.find(
          (p) =>
            (p.a.id === a.productId && p.b.id === b.productId) ||
            (p.a.id === b.productId && p.b.id === a.productId),
        );
        expect(par).toBeDefined();
        expect(par!.estado).toBe("pendiente");

        expect(await resolveDuplicate(par!.id, "confirmado", "admin@novastore.pe")).toBe(true);
        // Ya resuelto: no se puede volver a resolver.
        expect(await resolveDuplicate(par!.id, "descartado", "admin@novastore.pe")).toBe(false);
      });
    });

    describe("reclassifyProduct (reemplazo de foto al editar)", () => {
      it("vuelve a pendiente_revision cuando no hay clasificación", async () => {
        const creado = await createProductFromAI({
          nombre: "Producto Para Reclasificar",
          descripcion: "Este producto se va a editar y reclasificar en el test.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaVendedorNombre: "Audio y audífonos",
          precio: 69.9,
          stock: 4,
          imagenUrl: "https://example.com/reclasificar-1.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.95 }),
        });
        // Política por defecto ('todos'): ya arranca en pendiente_revision.
        const resultado = await reclassifyProduct({
          productId: creado.productId,
          nombre: "Producto Para Reclasificar",
          descripcion: "Descripción actualizada de más de veinte caracteres.",
          imagenUrl: "https://example.com/reclasificar-2.jpg",
          clasificacion: null,
        });
        expect(resultado.pendingReview).toBe(true);
      });
    });
  },
);
