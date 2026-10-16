"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  approveVendedorApplication,
  rejectVendedorApplication,
} from "@/lib/data/users-repo";

const schema = z.object({ vendedorId: z.string().min(1) });

export interface VendorActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}

export async function approveVendorAction(
  vendedorId: string,
): Promise<VendorActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };

  const parsed = schema.safeParse({ vendedorId });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const ok = await approveVendedorApplication(parsed.data.vendedorId, admin.email);
  if (!ok) return { success: false, error: "La solicitud ya no está pendiente." };
  return { success: true };
}

export async function rejectVendorAction(
  vendedorId: string,
): Promise<VendorActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "No autorizado." };

  const parsed = schema.safeParse({ vendedorId });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  const ok = await rejectVendedorApplication(parsed.data.vendedorId, admin.email);
  if (!ok) return { success: false, error: "La solicitud ya no está pendiente." };
  return { success: true };
}
