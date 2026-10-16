"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveDuplicate } from "@/lib/data/products-repo";

const schema = z.object({
  id: z.number().int().positive(),
  estado: z.enum(["confirmado", "descartado"]),
});

export interface ResolveDuplicateResult {
  success: boolean;
  error?: string;
}

export async function resolveDuplicateAction(
  id: number,
  estado: "confirmado" | "descartado",
): Promise<ResolveDuplicateResult> {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return { success: false, error: "No autorizado." };
  }

  const parsed = schema.safeParse({ id, estado });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  try {
    const ok = await resolveDuplicate(parsed.data.id, parsed.data.estado, session.email);
    if (!ok) return { success: false, error: "Ese par ya fue revisado." };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar la decisión.";
    return { success: false, error: message };
  }
}
