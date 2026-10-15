"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createProduct as createProductApi, getApiErrorMessage } from "@/lib/api";
import { addProduct, addPendingReview, REVIEW_THRESHOLD } from "@/lib/data/products-repo";
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

  // Un vendedor solo puede publicar productos a nombre de su propia marca,
  // sin importar qué `marca` haya enviado el formulario (ver el invariante
  // seller.nombre === product.marca documentado en lib/data/users-repo.ts).
  const marca = session.role === "SELLER" ? session.name : parsed.data.marca;

  try {
    const { producto, ai } = await createProductApi({ ...parsed.data, marca });

    if (ai.accuracy < REVIEW_THRESHOLD) {
      await addPendingReview(producto, ai.accuracy);
      return {
        success: true,
        pendingReview: true,
        predictedCategory: ai.predicted_category,
        accuracy: ai.accuracy,
      };
    }

    await addProduct(producto);
    return {
      success: true,
      pendingReview: false,
      predictedCategory: ai.predicted_category,
      accuracy: ai.accuracy,
    };
  } catch (error) {
    return { success: false, error: getApiErrorMessage(error) };
  }
}
