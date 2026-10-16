"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createProduct as createProductApi, getApiErrorMessage } from "@/lib/api";
import {
  createProductFromAI,
  updateProductRecord,
  removeProduct,
  isMarcaOwnedByOtherVendedor,
  isProductOwnedByVendedor,
} from "@/lib/data/products-repo";
import { getVendedorIdByEmail } from "@/lib/data/users-repo";
import { DEPARTAMENTOS } from "@/lib/taxonomy";

const createProductSchema = z.object({
  nombre: z.string().trim().min(2),
  precio: z.number().positive(),
  stock: z.number().int().nonnegative(),
  marca: z.string().trim().min(2),
  departamento: z.enum(DEPARTAMENTOS),
  imagen: z.instanceof(File),
});

export interface CreateProductResult {
  success: boolean;
  error?: string;
  predictedCategory?: string;
  accuracy?: number;
  pendingReview?: boolean;
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
    return { success: false, error: "Datos de producto inválidos." };
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
      return {
        success: false,
        error: "Tu cuenta no tiene una ficha de vendedor aprobada.",
      };
    }
    if (await isMarcaOwnedByOtherVendedor(marca, resolved)) {
      return {
        success: false,
        error: `La marca "${marca}" ya pertenece a otro vendedor.`,
      };
    }
    vendedorId = resolved;
  }

  // lib/api.ts sigue siendo el único punto que sube la imagen y clasifica
  // con IA — eso es un servicio externo, no la base de datos. Aquí solo
  // guardamos el resultado que devuelva.
  let ai, producto;
  try {
    ({ producto, ai } = await createProductApi({ ...parsed.data, marca }));
  } catch (error) {
    return { success: false, error: getApiErrorMessage(error) };
  }

  try {
    const { pendingReview } = await createProductFromAI({
      vendedorId,
      nombre: parsed.data.nombre,
      marca,
      departamento: parsed.data.departamento,
      precio: parsed.data.precio,
      stock: parsed.data.stock,
      imagenUrl: producto.imagen_url,
      categoriaPredichaNombre: ai.predicted_category,
      confianza: ai.accuracy,
    });

    return {
      success: true,
      pendingReview,
      predictedCategory: ai.predicted_category,
      accuracy: ai.accuracy,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar el producto en la base de datos.";
    return { success: false, error: message };
  }
}

const updateProductSchema = z.object({
  productId: z.string().min(1),
  nombre: z.string().trim().min(2),
  precio: z.number().positive(),
  stock: z.number().int().nonnegative(),
  marca: z.string().trim().min(2),
  departamento: z.enum(DEPARTAMENTOS),
});

export interface UpdateProductResult {
  success: boolean;
  error?: string;
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
    return { success: false, error: "Datos de producto inválidos." };
  }

  try {
    const { productId, ...patch } = parsed.data;

    if (session.role === "SELLER") {
      const vendedorId = await getVendedorIdByEmail(session.email);
      if (!vendedorId || !(await isProductOwnedByVendedor(productId, vendedorId))) {
        return { success: false, error: "No autorizado." };
      }
      if (await isMarcaOwnedByOtherVendedor(patch.marca, vendedorId)) {
        return {
          success: false,
          error: `La marca "${patch.marca}" ya pertenece a otro vendedor.`,
        };
      }
    }

    const updated = await updateProductRecord(productId, patch);
    if (!updated) return { success: false, error: "Producto no encontrado." };
    return { success: true };
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
