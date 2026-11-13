"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  crearMiembroPersonal,
  restablecerPasswordMiembro,
  setMiembroActivo,
  setMiembroRol,
  setMiembroModoCarga,
  PersonalError,
} from "@/lib/data/users-repo";

export interface PersonalActionResult {
  success: boolean;
  error?: string;
  // Solo al crear o restablecer: se muestra UNA vez al administrador para
  // que se la entregue al empleado (en la base solo queda el hash).
  passwordTemporal?: string;
}

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}

async function ejecutar(fn: () => Promise<string | void>): Promise<PersonalActionResult> {
  try {
    const passwordTemporal = await fn();
    revalidatePath("/admin/personal");
    return { success: true, passwordTemporal: passwordTemporal ?? undefined };
  } catch (error) {
    if (error instanceof PersonalError) return { success: false, error: error.message };
    throw error;
  }
}

const rolSchema = z.enum(["ADMIN", "CATALOGO"]);

const nuevoSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre completo.").max(120),
  email: z.email("Correo inválido.").trim(),
  rol: rolSchema,
});

export async function crearMiembroAction(input: unknown): Promise<PersonalActionResult> {
  if (!(await requireAdmin())) return { success: false, error: "No autorizado." };
  const parsed = nuevoSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  return ejecutar(async () => (await crearMiembroPersonal(parsed.data)).passwordTemporal);
}

const idSchema = z.uuid();

export async function cambiarActivoAction(id: string, activo: boolean): Promise<PersonalActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };
  if (!idSchema.safeParse(id).success || typeof activo !== "boolean") {
    return { success: false, error: "Datos inválidos." };
  }
  return ejecutar(() => setMiembroActivo(id, activo, admin.email));
}

export async function cambiarRolAction(id: string, rol: string): Promise<PersonalActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };
  const rolValido = rolSchema.safeParse(rol);
  if (!idSchema.safeParse(id).success || !rolValido.success) return { success: false, error: "Datos inválidos." };
  return ejecutar(() => setMiembroRol(id, rolValido.data, admin.email));
}

const modoSchema = z.enum(["asistido", "manual"]);

export async function cambiarModoCargaAction(id: string, modo: string): Promise<PersonalActionResult> {
  if (!(await requireAdmin())) return { success: false, error: "No autorizado." };
  const modoValido = modoSchema.safeParse(modo);
  if (!idSchema.safeParse(id).success || !modoValido.success) return { success: false, error: "Datos inválidos." };
  return ejecutar(() => setMiembroModoCarga(id, modoValido.data));
}

export async function restablecerPasswordAction(id: string): Promise<PersonalActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };
  if (!idSchema.safeParse(id).success) return { success: false, error: "Datos inválidos." };
  return ejecutar(() => restablecerPasswordMiembro(id, admin.email));
}
