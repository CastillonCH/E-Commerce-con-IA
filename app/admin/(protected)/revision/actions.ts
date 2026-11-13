"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { approvePendingReview, rejectPendingReview } from "@/lib/data/products-repo";

const schema = z.object({
  productId: z.string().min(1),
  categoriaFinal: z.string().trim().min(1).optional(),
  tiempoRevisionSeg: z.number().int().nonnegative().optional(),
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
  tiempoRevisionSeg?: number,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };

  const parsed = schema.safeParse({ productId, categoriaFinal, tiempoRevisionSeg });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  try {
    const product = await approvePendingReview(
      parsed.data.productId,
      admin.email,
      parsed.data.categoriaFinal,
      parsed.data.tiempoRevisionSeg,
    );
    if (!product) return { success: false, error: "El producto ya no está en revisión." };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aprobar el producto.";
    return { success: false, error: message };
  }
}

const rejectSchema = z.object({
  productId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(5, "Indica el motivo del rechazo (mínimo 5 caracteres).")
    .max(300, "El motivo no puede superar los 300 caracteres."),
  tiempoRevisionSeg: z.number().int().nonnegative().optional(),
});

// El motivo es obligatorio: es lo que ve el personal de catálogo para
// saber qué corregir antes de reenviar el producto.
export async function rejectReviewAction(
  productId: string,
  motivo: string,
  tiempoRevisionSeg?: number,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };

  const parsed = rejectSchema.safeParse({ productId, motivo, tiempoRevisionSeg });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  // También queda registrado quién rechazó y cuánto tardó (migración 006).
  const ok = await rejectPendingReview(parsed.data.productId, parsed.data.motivo, {
    adminEmail: admin.email,
    tiempoRevisionSeg: parsed.data.tiempoRevisionSeg,
  });
  if (!ok) return { success: false, error: "El producto ya no está en revisión." };

  return { success: true };
}
