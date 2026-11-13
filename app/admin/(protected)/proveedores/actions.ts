"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createProveedor, setProveedorActivo, ProveedorError } from "@/lib/data/proveedores-repo";

export interface ProveedorActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}

const vacioAUndefined = (valor: unknown) =>
  typeof valor === "string" && valor.trim() === "" ? undefined : valor;

const proveedorSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio.").max(120),
  razonSocial: z.preprocess(vacioAUndefined, z.string().trim().max(160).optional()),
  // Mismo formato que exige la base (proveedores_ruc_check).
  ruc: z.preprocess(
    vacioAUndefined,
    z
      .string()
      .trim()
      .regex(/^(10|15|17|20)\d{9}$/, "El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.")
      .optional(),
  ),
  email: z.preprocess(vacioAUndefined, z.email("Correo inválido.").optional()),
  telefono: z.preprocess(vacioAUndefined, z.string().trim().max(20).optional()),
});

export async function crearProveedorAction(input: unknown): Promise<ProveedorActionResult> {
  if (!(await requireAdmin())) return { success: false, error: "No autorizado." };

  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await createProveedor(parsed.data);
  } catch (error) {
    if (error instanceof ProveedorError) return { success: false, error: error.message };
    throw error;
  }
  revalidatePath("/admin/proveedores");
  return { success: true };
}

const activoSchema = z.object({ id: z.uuid(), activo: z.boolean() });

// Desactivar un proveedor solo lo saca del selector del formulario de
// producto: sus productos siguen a la venta (el stock ya se compró).
export async function cambiarProveedorActivoAction(
  id: string,
  activo: boolean,
): Promise<ProveedorActionResult> {
  if (!(await requireAdmin())) return { success: false, error: "No autorizado." };

  const parsed = activoSchema.safeParse({ id, activo });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const ok = await setProveedorActivo(parsed.data.id, parsed.data.activo);
  if (!ok) return { success: false, error: "Proveedor no encontrado." };
  revalidatePath("/admin/proveedores");
  return { success: true };
}
