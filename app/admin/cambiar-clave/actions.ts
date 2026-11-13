"use server";

import { z } from "zod";
import { canManageProducts, getSession } from "@/lib/auth";
import { cambiarPassword } from "@/lib/data/users-repo";

export interface CambiarClaveResult {
  success: boolean;
  error?: string;
}

// El personal entra al panel con datos de clientes y pedidos: se le exige
// una contraseña algo más fuerte que al cliente (mínimo 10, con letras y
// números).
const schema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual."),
    nueva: z
      .string()
      .min(10, "La nueva contraseña debe tener al menos 10 caracteres.")
      .max(72, "La nueva contraseña no puede superar los 72 caracteres.")
      .regex(/[A-Za-z]/, "La nueva contraseña debe tener al menos una letra.")
      .regex(/\d/, "La nueva contraseña debe tener al menos un número."),
    confirmacion: z.string(),
  })
  .refine((datos) => datos.nueva === datos.confirmacion, {
    message: "La confirmación no coincide con la nueva contraseña.",
    path: ["confirmacion"],
  });

export async function cambiarClaveAction(input: unknown): Promise<CambiarClaveResult> {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) return { success: false, error: "No autorizado." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const resultado = await cambiarPassword(session.email, parsed.data.actual, parsed.data.nueva);
  if (resultado === "actual_incorrecta") return { success: false, error: "La contraseña actual no es correcta." };
  if (resultado === "igual_a_la_actual") {
    return { success: false, error: "La nueva contraseña debe ser distinta de la actual." };
  }
  return { success: true };
}
