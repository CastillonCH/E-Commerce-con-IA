"use server";

import { z } from "zod";
import { canManageProducts, getSession } from "@/lib/auth";
import { clasificarProducto } from "@/lib/ai-client";
import { getServerEnv } from "@/lib/env.server";
import { findUserByEmail } from "@/lib/data/users-repo";
import { eliminarImagenProducto, guardarImagenProducto } from "@/lib/storage";
import {
  createProductFromAI,
  detectarYRegistrarDuplicados,
  buscarDuplicadosPorEmbeddings,
  type PosibleDuplicado,
  reclassifyProduct,
  updateProductRecord,
  cambiarEstadoProducto,
  eliminarProductoDefinitivo,
  type AccionEstado,
} from "@/lib/data/products-repo";
import { DEPARTAMENTOS, CATEGORIAS_IA, departamentoDeCategoria, type Departamento } from "@/lib/taxonomy";
import type { AIResultado, ProductStatus } from "@/types";

// "" (opción "Sin proveedor" del <select>) → sin proveedor.
const proveedorIdSchema = z
  .string()
  .optional()
  .transform((valor) => (valor ? valor : undefined))
  .pipe(z.uuid("Proveedor inválido").optional());

const createProductSchema = z
  .object({
    nombre: z.string().trim().min(2),
    descripcion: z
      .string()
      .trim()
      .min(20, "La descripción debe tener al menos 20 caracteres")
      .max(2000, "La descripción no puede superar los 2000 caracteres"),
    precio: z.number().positive(),
    stock: z.number().int().nonnegative(),
    marca: z.string().trim().min(2),
    departamento: z.enum(DEPARTAMENTOS),
    categoriaManual: z.string().min(1, "Selecciona una categoría"),
    proveedorId: proveedorIdSchema,
    imagen: z.instanceof(File),
    // Medición (migración 004): segundos desde que empezó a llenar el
    // formulario, y si llegó a ver la sugerencia de la IA antes de guardar.
    // Fuera de rango (formulario olvidado abierto, reloj raro) no se guarda.
    tiempoCargaSeg: z
      .number()
      .optional()
      .transform((seg) => (seg !== undefined && seg >= 1 && seg <= 7200 ? Math.round(seg) : undefined)),
    sugerenciaMostrada: z.boolean().optional(),
  })
  .refine(
    (data) => (CATEGORIAS_IA[data.departamento] as readonly string[]).includes(data.categoriaManual),
    { message: "La categoría no pertenece al departamento elegido.", path: ["categoriaManual"] },
  );

// --- "La IA primero": sugerencia ANTES de guardar --------------------------
export interface SugerenciaCategoria {
  categoria: string;
  departamento: Departamento;
  prob: number;
}

export interface SugerirResult {
  // false: la IA no está disponible (o el modo experimento la oculta) —
  // el formulario sigue funcionando y se elige a mano.
  disponible: boolean;
  aviso?: string;
  modo?: "real" | "demo";
  sugerencia?: SugerenciaCategoria;
  confianza?: number;
  alternativas?: SugerenciaCategoria[];
  duplicados?: PosibleDuplicado[];
}

const sugerirSchema = z.object({
  nombre: z.string().trim().min(2),
  descripcion: z.string().trim().min(20).max(2000),
  imagen: z.instanceof(File),
});

export async function sugerirCategoriaAction(input: unknown): Promise<SugerirResult> {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) {
    return { disponible: false, aviso: "No autorizado." };
  }
  // En modo experimento quien carga debe elegir sin ver a la IA (línea base).
  if (getServerEnv().MODO_CATALOGO !== "asistido") return { disponible: false };

  const parsed = sugerirSchema.safeParse(input);
  if (!parsed.success) return { disponible: false, aviso: "Faltan la foto, el nombre o la descripción." };

  let clasificacion: Awaited<ReturnType<typeof clasificarProducto>>;
  try {
    clasificacion = await clasificarProducto({
      titulo: parsed.data.nombre,
      descripcion: parsed.data.descripcion,
      imagen: parsed.data.imagen,
    });
  } catch {
    return {
      disponible: false,
      aviso: "La IA no está disponible en este momento: elige el departamento y la categoría a mano.",
    };
  }

  const conDepartamento = (categoria: string, prob: number): SugerenciaCategoria | null => {
    const departamento = departamentoDeCategoria(categoria);
    return departamento ? { categoria, departamento, prob } : null;
  };

  const sugerencia = conDepartamento(clasificacion.resultado.categoria, clasificacion.resultado.confianza);
  if (!sugerencia) return { disponible: false, aviso: "La IA devolvió una categoría desconocida." };

  const alternativas = clasificacion.resultado.top_k
    .filter((t) => t.categoria !== sugerencia.categoria)
    .map((t) => conDepartamento(t.categoria, t.prob))
    .filter((t): t is SugerenciaCategoria => t !== null)
    .slice(0, 3);

  // Solo con modelos reales hay embeddings comparables; nunca bloquea.
  let duplicados: PosibleDuplicado[] = [];
  if (clasificacion.modo === "real" && clasificacion.embeddings.length > 0) {
    try {
      duplicados = await buscarDuplicadosPorEmbeddings(clasificacion.embeddings);
    } catch {
      duplicados = [];
    }
  }

  return {
    disponible: true,
    modo: clasificacion.modo,
    sugerencia,
    confianza: clasificacion.resultado.confianza,
    alternativas,
    duplicados,
  };
}

export interface CreateProductResult {
  success: boolean;
  error?: string;
  pendingReview?: boolean;
  resultado?: AIResultado;
  avisoIA?: string;
}

function resultadoDesdeClasificacion(
  clasificacion: Awaited<ReturnType<typeof clasificarProducto>>,
): AIResultado {
  return {
    categoria: clasificacion.resultado.categoria,
    confidence: clasificacion.resultado.confianza,
    topK: clasificacion.resultado.top_k.map((t) => ({ categoria: t.categoria, prob: t.prob })),
    modo: clasificacion.modo,
  };
}

export async function createProductAction(
  input: unknown,
): Promise<CreateProductResult> {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) {
    return { success: false, error: "No autorizado." };
  }

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de producto inválidos." };
  }

  let imagenUrl: string;
  try {
    imagenUrl = await guardarImagenProducto(parsed.data.imagen);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la imagen.";
    return { success: false, error: message };
  }

  // Nunca bloquea al personal: si el servicio de IA no responde, el
  // producto se guarda igual (en revisión manual, sin predicción).
  let clasificacion: Awaited<ReturnType<typeof clasificarProducto>> | null = null;
  let avisoIA: string | undefined;
  try {
    clasificacion = await clasificarProducto({
      titulo: parsed.data.nombre,
      descripcion: parsed.data.descripcion,
      imagen: parsed.data.imagen,
    });
  } catch (error) {
    avisoIA =
      "No se pudo contactar al servicio de IA; el producto se guardó en revisión manual, sin predicción.";
    void error;
  }

  // "asistido" solo si de verdad vio la sugerencia: si la IA no respondió
  // en el formulario, eligió a ciegas y cuenta como carga manual.
  const modoCarga =
    getServerEnv().MODO_CATALOGO === "asistido" && parsed.data.sugerenciaMostrada ? "asistido" : "manual";
  const creadoPor = (await findUserByEmail(session.email))?.id;

  try {
    const { pendingReview, productId } = await createProductFromAI({
      creadoPor,
      modoCarga,
      tiempoCargaSeg: parsed.data.tiempoCargaSeg,
      proveedorId: parsed.data.proveedorId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion,
      marca: parsed.data.marca,
      departamento: parsed.data.departamento,
      categoriaManualNombre: parsed.data.categoriaManual,
      precio: parsed.data.precio,
      stock: parsed.data.stock,
      imagenUrl,
      clasificacion,
    });

    if (clasificacion?.modo === "real") {
      // CU5: no debe bloquear el alta si falla — se puede volver a correr
      // más tarde; un producto sin pares detectados no es un error.
      try {
        await detectarYRegistrarDuplicados(productId);
      } catch {
        // noop — ver comentario arriba
      }
    }

    return {
      success: true,
      pendingReview,
      resultado: clasificacion ? resultadoDesdeClasificacion(clasificacion) : undefined,
      avisoIA,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar el producto en la base de datos.";
    return { success: false, error: message };
  }
}

const updateProductSchema = z
  .object({
    productId: z.string().min(1),
    nombre: z.string().trim().min(2),
    descripcion: z.string().trim().min(20).max(2000),
    precio: z.number().positive(),
    stock: z.number().int().nonnegative(),
    marca: z.string().trim().min(2),
    departamento: z.enum(DEPARTAMENTOS),
    categoriaManual: z.string().min(1),
    proveedorId: proveedorIdSchema,
    imagen: z.instanceof(File).optional(),
  })
  .refine(
    (data) => (CATEGORIAS_IA[data.departamento] as readonly string[]).includes(data.categoriaManual),
    { message: "La categoría no pertenece al departamento elegido.", path: ["categoriaManual"] },
  );

export interface UpdateProductResult {
  success: boolean;
  error?: string;
  pendingReview?: boolean;
  resultado?: AIResultado;
  avisoIA?: string;
}

export async function updateProductAction(
  input: unknown,
): Promise<UpdateProductResult> {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) {
    return { success: false, error: "No autorizado." };
  }

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de producto inválidos." };
  }

  try {
    const { productId, imagen, proveedorId, ...patch } = parsed.data;

    const updated = await updateProductRecord(productId, {
      ...patch,
      proveedorId: proveedorId ?? null,
    });
    if (!updated.found) return { success: false, error: "Producto no encontrado o archivado." };

    if (!imagen) {
      return { success: true, pendingReview: updated.pendingReview };
    }

    let imagenUrl: string;
    try {
      imagenUrl = await guardarImagenProducto(imagen);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la imagen.";
      return { success: false, error: message };
    }

    let clasificacion: Awaited<ReturnType<typeof clasificarProducto>> | null = null;
    let avisoIA: string | undefined;
    try {
      clasificacion = await clasificarProducto({
        titulo: patch.nombre,
        descripcion: patch.descripcion,
        imagen,
      });
    } catch {
      avisoIA =
        "No se pudo contactar al servicio de IA; el producto quedó en revisión manual, sin nueva predicción.";
    }

    const { pendingReview } = await reclassifyProduct({
      productId,
      nombre: patch.nombre,
      descripcion: patch.descripcion,
      imagenUrl,
      clasificacion,
    });

    if (clasificacion?.modo === "real") {
      try {
        await detectarYRegistrarDuplicados(productId);
      } catch {
        // noop
      }
    }

    return {
      success: true,
      pendingReview,
      resultado: clasificacion ? resultadoDesdeClasificacion(clasificacion) : undefined,
      avisoIA,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar el producto.";
    return { success: false, error: message };
  }
}

export interface CambiarEstadoResult {
  success: boolean;
  error?: string;
  estado?: ProductStatus;
}

const accionSchema = z.object({
  productId: z.string().regex(/^\d+$/),
  accion: z.enum(["pausar", "reactivar", "archivar", "restaurar"]),
});

const ERROR_TRANSICION: Record<AccionEstado, string> = {
  pausar: "Solo se puede pausar un producto publicado.",
  reactivar: "Solo se puede reactivar un producto pausado.",
  archivar: "El producto ya está archivado.",
  restaurar: "Solo se puede restaurar un producto archivado.",
};

// Pausar / reactivar / archivar ("eliminar") / restaurar. Lo puede hacer
// todo el personal: son decisiones de catálogo, no de moderación.
export async function cambiarEstadoAction(
  productId: string,
  accion: AccionEstado,
): Promise<CambiarEstadoResult> {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) {
    return { success: false, error: "No autorizado." };
  }

  const parsed = accionSchema.safeParse({ productId, accion });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const estado = await cambiarEstadoProducto(parsed.data.productId, parsed.data.accion);
  if (!estado) return { success: false, error: ERROR_TRANSICION[parsed.data.accion] };
  return { success: true, estado };
}

export interface EliminarProductoActionResult {
  success: boolean;
  error?: string;
}

const ERROR_ELIMINAR = {
  no_encontrado: "El producto ya no existe.",
  vendido: "Este producto ya se vendió: no se puede eliminar, solo archivar.",
  no_permitido:
    "Solo un administrador puede eliminar un producto que ya estuvo a la venta. Puedes archivarlo.",
} as const;

// Borrado definitivo: solo productos que nunca se vendieron (ver
// eliminarProductoDefinitivo). No se puede deshacer.
export async function eliminarProductoAction(productId: string): Promise<EliminarProductoActionResult> {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "CATALOGO")) {
    return { success: false, error: "No autorizado." };
  }

  const parsed = z.string().regex(/^\d+$/).safeParse(productId);
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const resultado = await eliminarProductoDefinitivo(parsed.data, session.role);
  if (!resultado.ok) return { success: false, error: ERROR_ELIMINAR[resultado.motivo] };

  await Promise.all(resultado.imagenesHuerfanas.map(eliminarImagenProducto));
  return { success: true };
}
