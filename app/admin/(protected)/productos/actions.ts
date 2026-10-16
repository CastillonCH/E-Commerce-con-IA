"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clasificarProducto } from "@/lib/ai-client";
import { guardarImagenProducto } from "@/lib/storage";
import {
  createProductFromAI,
  detectarYRegistrarDuplicados,
  reclassifyProduct,
  updateProductRecord,
  removeProduct,
  isMarcaOwnedByOtherVendedor,
  isProductOwnedByVendedor,
} from "@/lib/data/products-repo";
import { getVendedorIdByEmail } from "@/lib/data/users-repo";
import { DEPARTAMENTOS, CATEGORIAS_IA } from "@/lib/taxonomy";
import type { AIResultado } from "@/types";

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
    categoriaVendedor: z.string().min(1, "Selecciona una categoría"),
    imagen: z.instanceof(File),
  })
  .refine(
    (data) => (CATEGORIAS_IA[data.departamento] as readonly string[]).includes(data.categoriaVendedor),
    { message: "La categoría no pertenece al departamento elegido.", path: ["categoriaVendedor"] },
  );

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
  if (!session || session.role === "CLIENT") {
    return { success: false, error: "No autorizado." };
  }

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de producto inválidos." };
  }

  const marca = parsed.data.marca;

  // Un vendedor crea productos a nombre de su propia ficha (vendedor_id,
  // resuelta de su sesión) sin importar qué marca haya escrito — eso evita
  // que publique productos para otro vendedor. El texto de `marca` sigue
  // siendo libre, pero no puede ser una marca que ya tengan productos de
  // OTRO vendedor (no se puede suplantar una marca ajena).
  let vendedorId: string | undefined;
  if (session.role === "SELLER") {
    const resolved = await getVendedorIdByEmail(session.email);
    if (!resolved) {
      return { success: false, error: "Tu cuenta no tiene una ficha de vendedor aprobada." };
    }
    if (await isMarcaOwnedByOtherVendedor(marca, resolved)) {
      return { success: false, error: `La marca "${marca}" ya pertenece a otro vendedor.` };
    }
    vendedorId = resolved;
  }

  let imagenUrl: string;
  try {
    imagenUrl = await guardarImagenProducto(parsed.data.imagen);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar la imagen.";
    return { success: false, error: message };
  }

  // Nunca bloquea al vendedor: si el servicio de IA no responde, el
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

  try {
    const { pendingReview, productId } = await createProductFromAI({
      vendedorId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion,
      marca,
      departamento: parsed.data.departamento,
      categoriaVendedorNombre: parsed.data.categoriaVendedor,
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
    categoriaVendedor: z.string().min(1),
    imagen: z.instanceof(File).optional(),
  })
  .refine(
    (data) => (CATEGORIAS_IA[data.departamento] as readonly string[]).includes(data.categoriaVendedor),
    { message: "La categoría no pertenece al departamento elegido.", path: ["categoriaVendedor"] },
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
  if (!session || session.role === "CLIENT") {
    return { success: false, error: "No autorizado." };
  }

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de producto inválidos." };
  }

  try {
    const { productId, imagen, ...patch } = parsed.data;

    if (session.role === "SELLER") {
      const vendedorId = await getVendedorIdByEmail(session.email);
      if (!vendedorId || !(await isProductOwnedByVendedor(productId, vendedorId))) {
        return { success: false, error: "No autorizado." };
      }
      if (await isMarcaOwnedByOtherVendedor(patch.marca, vendedorId)) {
        return { success: false, error: `La marca "${patch.marca}" ya pertenece a otro vendedor.` };
      }
    }

    const updated = await updateProductRecord(productId, patch);
    if (!updated) return { success: false, error: "Producto no encontrado." };

    if (!imagen) {
      return { success: true };
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

export interface DeleteProductResult {
  success: boolean;
  error?: string;
}

export async function deleteProductAction(
  productId: string,
): Promise<DeleteProductResult> {
  const session = await getSession();
  if (!session || session.role === "CLIENT") {
    return { success: false, error: "No autorizado." };
  }

  if (session.role === "SELLER") {
    const vendedorId = await getVendedorIdByEmail(session.email);
    if (!vendedorId || !(await isProductOwnedByVendedor(productId, vendedorId))) {
      return { success: false, error: "No autorizado." };
    }
  }

  const ok = await removeProduct(productId);
  if (!ok) return { success: false, error: "Producto no encontrado." };
  return { success: true };
}
