import { afterAll, afterEach, describe, expect, it } from "vitest";
import { closePool, query, queryOne } from "@/lib/db";
import { crearMiembroPersonal } from "@/lib/data/users-repo";
import { obtenerMetricasCarga, ahorroPorcentual, obtenerMetricasProceso } from "@/lib/data/carga-repo";
import type { ClasificarResponse } from "@/lib/ai-client";
import {
  listProducts,
  getProductById,
  listOfertas,
  listNuevos,
  listRelacionados,
  listByMarca,
  updateProductRecord,
  cambiarEstadoProducto,
  eliminarProductoDefinitivo,
  listAdminProducts,
  getAdminProductById,
  countProductsByEstado,
  createProductFromAI,
  reclassifyProduct,
  listPendingReview,
  approvePendingReview,
  rejectPendingReview,
  listPossibleDuplicates,
  listDetectedDuplicates,
  resolveDuplicate,
  detectarYRegistrarDuplicados,
  buscarDuplicadosPorEmbeddings,
  getCategoriaManualNombre,
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

    describe("updateProductRecord: cambios menores directo, importantes a revisión", () => {
      // Producto propio de estos tests (publicado por la IA con política
      // "umbral"), para no sacar de la tienda a los productos semilla que
      // usan los demás tests y los E2E.
      async function crearPublicado(nombre: string): Promise<string> {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        const creado = await createProductFromAI({
          nombre,
          descripcion: "Producto de prueba para los tests de edición del panel.",
          marca: "HogarPlus",
          departamento: "Hogar",
          categoriaManualNombre: "Decoración y menaje",
          precio: 50,
          stock: 5,
          imagenUrl: "https://example.com/edicion.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Decoración y menaje", confianza: 0.95, modo: "demo" }),
        });
        expect(creado.pendingReview).toBe(false);
        return creado.productId;
      }

      it("precio y stock se actualizan sin sacar el producto de la tienda", async () => {
        const id = await crearPublicado("Florero Para Editar Precio");
        const result = await updateProductRecord(id, { precio: 199.9, stock: 10 });
        expect(result).toEqual({ found: true, pendingReview: false });
        const product = await getProductById(id);
        expect(product?.precio).toBe(199.9);
        expect(product?.stock).toBe(10);
      });

      it("cambiar el nombre de un producto publicado lo devuelve a revisión", async () => {
        const id = await crearPublicado("Florero Para Renombrar");
        const result = await updateProductRecord(id, {
          nombre: "Florero Renombrado",
          descripcion: "Nueva descripción de al menos veinte caracteres.",
        });
        expect(result).toEqual({ found: true, pendingReview: true });
        expect(await getProductById(id)).toBeNull(); // ya no está en la tienda
        const enPanel = await getAdminProductById(id);
        expect(enPanel?.estado).toBe("pendiente_revision");
        expect(enPanel?.nombre).toBe("Florero Renombrado");
      });

      it("actualiza la categoría manual solo cuando viene junto con el departamento", async () => {
        const id = await crearPublicado("Florero Para Recategorizar");
        await updateProductRecord(id, { departamento: "Hogar", categoriaManual: "Muebles" });
        expect(await getCategoriaManualNombre(id)).toBe("Muebles");
      });

      it("rechaza una categoría que no pertenece al departamento enviado", async () => {
        await expect(
          updateProductRecord("2", { departamento: "Hogar", categoriaManual: "Audio y audífonos" }),
        ).rejects.toThrow(/no pertenece al departamento/);
        expect(await getProductById("2")).not.toBeNull(); // no se tocó
      });

      it("no encuentra un id inexistente", async () => {
        expect(await updateProductRecord("99999", { stock: 1 })).toEqual({ found: false, pendingReview: false });
      });
    });

    describe("cambiarEstadoProducto: pausar, reactivar, archivar, restaurar", () => {
      it("pausar saca el producto de la tienda y reactivar lo devuelve", async () => {
        expect(await cambiarEstadoProducto("4", "pausar")).toBe("pausado");
        expect(await getProductById("4")).toBeNull();
        expect(await cambiarEstadoProducto("4", "pausar")).toBeNull(); // ya estaba pausado

        expect(await cambiarEstadoProducto("4", "reactivar")).toBe("publicado");
        expect(await getProductById("4")).not.toBeNull();
      });

      it("archivar lo saca de la tienda; restaurar lo deja pausado (no a la venta)", async () => {
        expect(await cambiarEstadoProducto("3", "archivar")).toBe("archivado");
        expect(await getProductById("3")).toBeNull();
        expect(await cambiarEstadoProducto("3", "archivar")).toBeNull();
        expect(await updateProductRecord("3", { stock: 1 })).toEqual({ found: false, pendingReview: false });

        expect(await cambiarEstadoProducto("3", "restaurar")).toBe("pausado");
        expect(await cambiarEstadoProducto("3", "reactivar")).toBe("publicado");
      });

      it("no hace nada con un id inexistente", async () => {
        expect(await cambiarEstadoProducto("99999", "archivar")).toBeNull();
      });

      it("el panel lista cada estado por separado y los cuenta", async () => {
        await cambiarEstadoProducto("5", "pausar");
        const pausados = await listAdminProducts("pausado");
        expect(pausados.some((p) => p.id === "5")).toBe(true);
        expect(pausados.every((p) => p.estado === "pausado")).toBe(true);
        expect((await countProductsByEstado()).pausado).toBeGreaterThanOrEqual(1);
        await cambiarEstadoProducto("5", "reactivar");
      });

      it("el panel muestra el proveedor del producto", async () => {
        expect((await getAdminProductById("1"))?.proveedor).toBe("SoundMax Perú");
      });
    });

    describe("eliminarProductoDefinitivo: lo que nunca se vendió se borra; lo vendido solo se archiva", () => {
      async function crearEnRevision(nombre: string, imagenUrl = "https://example.com/eliminar.jpg"): Promise<string> {
        process.env.REVIEW_POLICY = "todos";
        const creado = await createProductFromAI({
          nombre,
          descripcion: "Producto de prueba para los tests de eliminación.",
          marca: "KidsWorld",
          departamento: "Juguetes",
          categoriaManualNombre: "Peluches",
          precio: 15,
          stock: 3,
          imagenUrl,
          clasificacion: clasificacionFalsa({ categoria: "Peluches", confianza: 0.9 }),
        });
        return creado.productId;
      }

      it("CATALOGO borra un producto en revisión; su foto queda para borrar del disco", async () => {
        const id = await crearEnRevision("Peluche Mal Cargado", "https://example.com/peluche-mal-cargado.jpg");
        const resultado = await eliminarProductoDefinitivo(id, "CATALOGO");
        expect(resultado).toEqual({
          ok: true,
          nombre: "Peluche Mal Cargado",
          imagenesHuerfanas: ["https://example.com/peluche-mal-cargado.jpg"],
        });
        expect(await getAdminProductById(id)).toBeNull();
      });

      it("una foto que usa otro producto no se borra del disco", async () => {
        const compartida = "https://example.com/foto-compartida.jpg";
        const a = await crearEnRevision("Peluche Foto Compartida A", compartida);
        const b = await crearEnRevision("Peluche Foto Compartida B", compartida);
        const resultado = await eliminarProductoDefinitivo(a, "ADMIN");
        expect(resultado.ok && resultado.imagenesHuerfanas).toEqual([]);
        expect((await getAdminProductById(b))?.imagen_url).toBe(compartida);
      });

      it("CATALOGO no puede borrar un producto que ya estuvo a la venta; ADMIN sí, si nunca se vendió", async () => {
        const id = await crearEnRevision("Peluche Publicado Sin Ventas");
        await approvePendingReview(id, "admin@novastore.pe", "Peluches");
        expect(await eliminarProductoDefinitivo(id, "CATALOGO")).toEqual({ ok: false, motivo: "no_permitido" });
        expect((await eliminarProductoDefinitivo(id, "ADMIN")).ok).toBe(true);
      });

      it("un producto que ya se vendió no se puede borrar, ni siquiera por ADMIN", async () => {
        // El producto 1 tiene pedidos en los datos semilla.
        expect(await eliminarProductoDefinitivo("1", "ADMIN")).toEqual({ ok: false, motivo: "vendido" });
        expect((await getAdminProductById("1"))?.vendido).toBe(true);
        expect(await getProductById("1")).not.toBeNull();
      });

      it("un id inexistente no se encuentra", async () => {
        expect(await eliminarProductoDefinitivo("99999", "ADMIN")).toEqual({ ok: false, motivo: "no_encontrado" });
      });
    });

    describe("createProductFromAI — sin clasificación (servicio de IA caído)", () => {
      it("acepta una marca nueva y un producto sin proveedor (NovaStore vende todo)", async () => {
        const result = await createProductFromAI({
          nombre: "Producto De Marca Nueva",
          descripcion: "Una descripción cualquiera de más de veinte caracteres.",
          marca: "MarcaNuevaDePrueba",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
          precio: 10,
          stock: 1,
          imagenUrl: "https://example.com/x.jpg",
          clasificacion: null,
        });
        const enPanel = await getAdminProductById(result.productId);
        expect(enPanel).toMatchObject({ marca: "MarcaNuevaDePrueba", proveedor: null, estado: "pendiente_revision" });
      });

      it("nunca bloquea al personal: sin clasificación, el producto se guarda igual en revisión, sin predicción", async () => {
        const result = await createProductFromAI({
          nombre: "Producto Sin IA Disponible",
          descripcion: "El servicio de IA no respondió para este producto de prueba.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
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
        // Sin predicción: el revisor ve la categoría que eligió la persona.
        expect(entry).toMatchObject({ origen: "persona", confidence: null });
        expect(entry!.product.categoria_ia).toBe("Audio y audífonos");
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
          categoriaManualNombre: "Audio y audífonos",
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
          categoriaManualNombre: "Ropa deportiva",
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
          categoriaManualNombre: "Ropa deportiva",
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
          categoriaManualNombre: "Decoración y menaje",
          precio: 79.9,
          stock: 8,
          imagenUrl: "https://example.com/sabanas.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.99 }),
        });
        expect(result.pendingReview).toBe(true);
      });

      it("rechazar guarda el motivo; al corregirlo vuelve a revisión sin motivo", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";

        await createProductFromAI({
          nombre: "Producto a Rechazar",
          descripcion: "Este producto se va a rechazar en el test, a propósito.",
          marca: "KidsWorld",
          departamento: "Juguetes",
          categoriaManualNombre: "Peluches",
          precio: 19.9,
          stock: 5,
          imagenUrl: "https://example.com/rechazo.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Peluches", confianza: 0.2 }),
        });
        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.nombre === "Producto a Rechazar")!;

        expect(await rejectPendingReview(entry.product.id, "Foto de baja calidad")).toBe(true);
        expect(await getProductById(entry.product.id)).toBeNull();
        const pendingAfter = await listPendingReview();
        expect(pendingAfter.some((p) => p.product.id === entry.product.id)).toBe(false);

        const rechazados = await listAdminProducts("rechazado");
        expect(rechazados.find((p) => p.id === entry.product.id)?.motivoRechazo).toBe("Foto de baja calidad");

        // El personal lo corrige (aunque sea solo el precio) y se reenvía.
        expect(await updateProductRecord(entry.product.id, { precio: 24.9 })).toEqual({
          found: true,
          pendingReview: true,
        });
        const corregido = await getAdminProductById(entry.product.id);
        expect(corregido).toMatchObject({ estado: "pendiente_revision", motivoRechazo: null });
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
          categoriaManualNombre: "Audio y audífonos",
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
          categoriaManualNombre: "Audio y audífonos",
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

      it("en modo demo, NO guarda predicciones_ia, pero el revisor ve la sugerencia fusionada", async () => {
        process.env.REVIEW_POLICY = "todos";

        const result = await createProductFromAI({
          nombre: "Producto En Modo Demo",
          descripcion: "Clasificado solo con reglas de palabras clave, sin modelo real.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
          precio: 29.9,
          stock: 7,
          imagenUrl: "https://example.com/demo.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.4, modo: "demo" }),
        });

        const pending = await listPendingReview();
        const entry = pending.find((p) => p.product.id === result.productId);
        // La sugerencia (resultado fusionado) se guarda en el producto
        // (migración 006): es la misma que vio quien lo cargó.
        expect(entry?.origen).toBe("ia");
        expect(entry?.confidence).toBe(0.4);
        expect(entry?.product.categoria_ia).toBe("Audio y audífonos");
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
          categoriaManualNombre: "Polos y camisas",
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
          categoriaManualNombre: "Polos y camisas",
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
          categoriaManualNombre: "Audio y audífonos",
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
          categoriaManualNombre: "Audio y audífonos",
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
        // duplicados_detectados.id es bigint (llega como texto de pg): tiene
        // que salir como número, o resolveDuplicateAction (z.number()) lo
        // rechaza con "Datos inválidos" y los botones de /admin/duplicados
        // no hacen nada.
        expect(typeof par!.id).toBe("number");

        // Confirmar archiva la copia más nueva (b se creó después que a).
        expect(await resolveDuplicate(par!.id, "confirmado", "admin@novastore.pe")).toEqual({
          ok: true,
          archivado: { id: b.productId, nombre: "Parlante Portátil XZ1 Pro" },
        });
        expect((await getAdminProductById(b.productId))?.estado).toBe("archivado");
        expect((await getAdminProductById(a.productId))?.estado).not.toBe("archivado");
        // Ya resuelto: no se puede volver a resolver.
        expect((await resolveDuplicate(par!.id, "descartado", "admin@novastore.pe")).ok).toBe(false);
      });
    });

    describe("carga asistida por la IA (migración 004)", () => {
      async function medicion(productId: string) {
        return queryOne<{ modo_carga: string | null; tiempo_carga_seg: number | null; sugerencia_aceptada: boolean | null }>(
          `SELECT modo_carga, tiempo_carga_seg, sugerencia_aceptada FROM productos WHERE id = $1`,
          [productId],
        );
      }

      it("asistido y aceptó la sugerencia segura: se publica y queda medido", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        const result = await createProductFromAI({
          nombre: "Audífonos Asistidos Aceptados",
          descripcion: "Audífonos cargados con la sugerencia de la IA a la vista.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
          precio: 89.9,
          stock: 4,
          imagenUrl: "https://example.com/asistido-ok.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.95 }),
          modoCarga: "asistido",
          tiempoCargaSeg: 42,
        });
        expect(result.pendingReview).toBe(false);
        expect(await medicion(result.productId)).toEqual({
          modo_carga: "asistido",
          tiempo_carga_seg: 42,
          sugerencia_aceptada: true,
        });
      });

      it("asistido pero corrigió a la IA: va a revisión aunque la IA estuviera segura", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        const result = await createProductFromAI({
          nombre: "Smartwatch Corregido Por Persona",
          descripcion: "La IA dijo audio, pero la persona eligió relojes inteligentes.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Relojes inteligentes y wearables",
          precio: 199.9,
          stock: 2,
          imagenUrl: "https://example.com/asistido-corregido.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.95 }),
          modoCarga: "asistido",
          tiempoCargaSeg: 75,
        });
        expect(result.pendingReview).toBe(true);
        expect((await medicion(result.productId))?.sugerencia_aceptada).toBe(false);
        const enRevision = (await listPendingReview()).find((e) => e.product.id === result.productId);
        expect(enRevision).toMatchObject({
          modoCarga: "asistido",
          categoriaPersonal: "Relojes inteligentes y wearables",
        });
      });

      it("manual (experimento): no registra sugerencia y sigue la regla de siempre", async () => {
        process.env.REVIEW_POLICY = "todos";
        const result = await createProductFromAI({
          nombre: "Licuadora Carga Manual",
          descripcion: "Licuadora cargada eligiendo la categoría sin ver a la IA.",
          marca: "HomeChef",
          departamento: "Hogar",
          categoriaManualNombre: "Electrodomésticos de cocina",
          precio: 159.9,
          stock: 3,
          imagenUrl: "https://example.com/manual.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Electrodomésticos de cocina", confianza: 0.95 }),
          modoCarga: "manual",
          tiempoCargaSeg: 120,
        });
        expect(await medicion(result.productId)).toEqual({
          modo_carga: "manual",
          tiempo_carga_seg: 120,
          sugerencia_aceptada: null,
        });
      });

      it("avisa ANTES de guardar si el producto parece ya existir", async () => {
        process.env.REVIEW_POLICY = "todos";
        const existente = clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.9 });
        const creado = await createProductFromAI({
          nombre: "Parlante Que Ya Existe",
          descripcion: "Producto ya cargado; otro igual no debería crearse de nuevo.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
          precio: 79.9,
          stock: 6,
          imagenUrl: "https://example.com/ya-existe.jpg",
          clasificacion: existente,
        });

        // El "nuevo" todavía no está en la base: solo hay sus embeddings.
        const casiIguales = existente.embeddings.map((e) => ({ ...e, vector: e.vector.map((v) => v + 0.0001) }));
        const avisos = await buscarDuplicadosPorEmbeddings(casiIguales);
        expect(avisos[0]).toMatchObject({ id: creado.productId, nombre: "Parlante Que Ya Existe" });
        expect(avisos[0].similitud).toBeGreaterThan(0.99);

        const distintos = clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.9 }).embeddings.map((e) => ({
          ...e,
          vector: e.vector.map((v, i) => (i % 2 === 0 ? v : -v)),
        }));
        expect((await buscarDuplicadosPorEmbeddings(distintos)).some((a) => a.id === creado.productId)).toBe(false);
      });

      it("las métricas comparan el tiempo sin IA vs con IA de cada persona", async () => {
        process.env.REVIEW_POLICY = "todos";
        const email = `carga-${Date.now()}@novastore.pe`;
        const { id } = await crearMiembroPersonal({ nombre: "Carga Medida", email, rol: "CATALOGO" });
        const base = {
          descripcion: "Ficha para medir el tiempo de carga de una persona.",
          marca: "SoundMax",
          departamento: "Electrónica" as const,
          categoriaManualNombre: "Audio y audífonos",
          precio: 50,
          stock: 1,
          imagenUrl: "https://example.com/metricas.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Audio y audífonos", confianza: 0.9 }),
          creadoPor: id,
        };
        await createProductFromAI({ ...base, nombre: "Medida Manual 1", modoCarga: "manual", tiempoCargaSeg: 200 });
        await createProductFromAI({ ...base, nombre: "Medida Manual 2", modoCarga: "manual", tiempoCargaSeg: 160 });
        await createProductFromAI({ ...base, nombre: "Medida Asistida", modoCarga: "asistido", tiempoCargaSeg: 60 });

        const mias = await obtenerMetricasCarga(email);
        expect(mias.manual).toMatchObject({ fichas: 2, segMediana: 180 });
        expect(mias.asistido).toMatchObject({ fichas: 1, segMediana: 60, pctSugerenciasAceptadas: 100 });
        expect(ahorroPorcentual(mias)).toBe(67);
      });
    });

    describe("proceso sin IA vs con IA (migración 006)", () => {
      const ficha = {
        descripcion: "Ficha para medir el proceso completo sin IA y con IA.",
        marca: "HomeChef",
        departamento: "Hogar" as const,
        precio: 99.9,
        stock: 2,
        imagenUrl: "https://example.com/proceso.jpg",
      };

      it("sin IA: nunca se publica sola, guarda la IA oculta y el revisor ve la categoría de la persona", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        const result = await createProductFromAI({
          ...ficha,
          nombre: "Licuadora Sin IA Segura",
          categoriaManualNombre: "Muebles",
          clasificacion: clasificacionFalsa({ categoria: "Electrodomésticos de cocina", confianza: 0.99 }),
          modoCarga: "manual",
          tiempoCargaSeg: 90,
        });
        expect(result.pendingReview).toBe(true);

        const guardada = await queryOne<{ categoria_ia: string; auto_publicado: boolean }>(
          `SELECT c.nombre AS categoria_ia, p.auto_publicado FROM productos p
             JOIN categorias c ON c.id = p.categoria_ia_id WHERE p.id = $1`,
          [result.productId],
        );
        expect(guardada).toEqual({ categoria_ia: "Electrodomésticos de cocina", auto_publicado: false });

        const entry = (await listPendingReview()).find((e) => e.product.id === result.productId);
        expect(entry).toMatchObject({ origen: "persona", confidence: null, modoCarga: "manual" });
        expect(entry?.product.categoria_ia).toBe("Muebles");

        // El revisor la corrige: queda registrado que corrigió a la PERSONA.
        await approvePendingReview(result.productId, "admin@novastore.pe", "Electrodomésticos de cocina", 25);
        const revision = await queryOne<{ origen_sugerencia: string; accion: string; modo_carga: string; prediccion_id: number | null }>(
          `SELECT origen_sugerencia, accion, modo_carga, prediccion_id FROM revisiones_categoria WHERE producto_id = $1`,
          [result.productId],
        );
        expect(revision).toEqual({ origen_sugerencia: "persona", accion: "corregida", modo_carga: "manual", prediccion_id: null });
      });

      it("con IA pero la IA caída: queda fuera de la medición y nunca se publica sola", async () => {
        process.env.REVIEW_POLICY = "umbral";
        const email = `caida-${Date.now()}@novastore.pe`;
        const { id } = await crearMiembroPersonal({ nombre: "Carga Con IA Caída", email, rol: "CATALOGO" });
        const result = await createProductFromAI({
          ...ficha,
          nombre: "Ficha Con IA Caída",
          categoriaManualNombre: "Muebles",
          clasificacion: null,
          creadoPor: id,
          modoCarga: "asistido",
          iaNoDisponible: true,
          tiempoCargaSeg: 300,
        });
        expect(result.pendingReview).toBe(true);
        expect(await obtenerMetricasCarga(email)).toEqual({});
        const entry = (await listPendingReview()).find((e) => e.product.id === result.productId);
        expect(entry).toMatchObject({ origen: "persona", iaNoDisponible: true });
      });

      it("un rechazo guarda quién y cuánto tardó; cuenta la primera decisión y el error va contra la referencia", async () => {
        process.env.REVIEW_POLICY = "todos";
        const nombre = `Ficha Del Experimento ${Date.now()}`;
        await query(
          `INSERT INTO experimento_fichas (codigo, grupo, nombre, categoria_referencia_id, fuente)
           SELECT $1, 'A', $2, id, 'prueba' FROM categorias WHERE nombre = 'Electrodomésticos de cocina'`,
          [`T${Date.now() % 1e9}`, nombre],
        );
        const result = await createProductFromAI({
          ...ficha,
          // Mismo nombre con otras mayúsculas y espacios: igual se enlaza.
          nombre: `  ${nombre.toUpperCase()} `,
          categoriaManualNombre: "Muebles",
          clasificacion: clasificacionFalsa({ categoria: "Electrodomésticos de cocina", confianza: 0.6 }),
          modoCarga: "manual",
          tiempoCargaSeg: 100,
        });
        const enlace = await queryOne<{ producto_id: string }>(
          `SELECT producto_id::text FROM experimento_fichas WHERE nombre = $1`,
          [nombre],
        );
        expect(enlace?.producto_id).toBe(result.productId);

        expect(
          await rejectPendingReview(result.productId, "Foto de baja calidad", {
            adminEmail: "admin@novastore.pe",
            tiempoRevisionSeg: 40,
          }),
        ).toBe(true);
        const rechazo = await queryOne<{ tiempo_revision_seg: number; modo_carga: string }>(
          `SELECT tiempo_revision_seg, modo_carga FROM rechazos_revision WHERE producto_id = $1`,
          [result.productId],
        );
        expect(rechazo).toEqual({ tiempo_revision_seg: 40, modo_carga: "manual" });

        // Se reenvía y se aprueba corrigiendo: para la medición cuenta el rechazo.
        await query(`UPDATE productos SET estado = 'pendiente_revision' WHERE id = $1`, [result.productId]);
        await approvePendingReview(result.productId, "admin@novastore.pe", "Electrodomésticos de cocina", 15);

        const sinIA = (await obtenerMetricasProceso(true)).manual;
        expect(sinIA).toMatchObject({
          fichas: 1,
          pctARevision: 100,
          segRevisionMediana: 40,
          segProcesoMediana: 140,
          conReferencia: 1,
          pctErrorCarga: 100,
          pctErrorIA: 0,
          pctErrorPublicado: 0,
        });
      });

      it("al reemplazar la foto, una ficha sin IA tampoco se publica sola", async () => {
        process.env.REVIEW_POLICY = "umbral";
        process.env.REVIEW_THRESHOLD = "0.75";
        const creado = await createProductFromAI({
          ...ficha,
          nombre: "Ficha Sin IA Editada",
          categoriaManualNombre: "Electrodomésticos de cocina",
          clasificacion: clasificacionFalsa({ categoria: "Electrodomésticos de cocina", confianza: 0.95 }),
          modoCarga: "manual",
        });
        const resultado = await reclassifyProduct({
          productId: creado.productId,
          nombre: "Ficha Sin IA Editada",
          descripcion: "Descripción actualizada de más de veinte caracteres.",
          imagenUrl: "https://example.com/proceso-2.jpg",
          clasificacion: clasificacionFalsa({ categoria: "Electrodomésticos de cocina", confianza: 0.97 }),
        });
        expect(resultado.pendingReview).toBe(true);
      });
    });

    describe("reclassifyProduct (reemplazo de foto al editar)", () => {
      it("vuelve a pendiente_revision cuando no hay clasificación", async () => {
        const creado = await createProductFromAI({
          nombre: "Producto Para Reclasificar",
          descripcion: "Este producto se va a editar y reclasificar en el test.",
          marca: "SoundMax",
          departamento: "Electrónica",
          categoriaManualNombre: "Audio y audífonos",
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
