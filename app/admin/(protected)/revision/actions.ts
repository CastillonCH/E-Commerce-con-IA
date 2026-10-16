"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { approvePendingReview, rejectPendingReview } from "@/lib/data/products-repo";

const schema = z.object({
  productId: z.string().min(1),
  categoriaFinal: z.string().trim().min(1).optional(),
});

export interface ReviewActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}

export async function approveReviewAction(
  productId: string,
  categoriaFinal?: string,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };

  const parsed = schema.safeParse({ productId, categoriaFinal });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  try {
    const product = await approvePendingReview(
      parsed.data.productId,
      admin.email,
      parsed.data.categoriaFinal,
    );
    if (!product) return { success: false, error: "El producto ya no está en revisión." };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aprobar el producto.";
    return { success: false, error: message };
  }
}

export async function rejectReviewAction(
  productId: string,
): Promise<ReviewActionResult> {
  if (!(await requireAdmin())) return { success: false, error: "No autorizado." };

  const parsed = schema.pick({ productId: true }).safeParse({ productId });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const ok = await rejectPendingReview(parsed.data.productId);
  if (!ok) return { success: false, error: "El producto ya no está en revisión." };

  return { success: true };
}
