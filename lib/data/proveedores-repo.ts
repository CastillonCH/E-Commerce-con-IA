import "server-only";
import type { Proveedor } from "@/types";
import { query, queryOne, isPgError, PG_ERROR } from "@/lib/db";

// Proveedores: las empresas a las que NovaStore compra la mercadería. Son
// solo datos (contacto, RUC) para el personal; no inician sesión ni deciden
// si un producto se vende. Desactivar un proveedor no saca sus productos de
// la tienda: el stock que ya se compró se sigue vendiendo.

interface ProveedorRow {
  id: string;
  nombre: string;
  razonSocial: string | null;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  productos: number;
}

export async function listProveedores(): Promise<Proveedor[]> {
  return query<ProveedorRow>(`SELECT * FROM v_admin_proveedores ORDER BY activo DESC, nombre`);
}

/** Para el selector del formulario de producto: solo los activos. */
export async function listProveedoresActivos(): Promise<Pick<Proveedor, "id" | "nombre">[]> {
  return query<{ id: string; nombre: string }>(
    `SELECT id::text AS id, nombre FROM proveedores WHERE activo ORDER BY nombre`,
  );
}

export class ProveedorError extends Error {}

export interface ProveedorInput {
  nombre: string;
  razonSocial?: string;
  ruc?: string;
  email?: string;
  telefono?: string;
}

export async function createProveedor(input: ProveedorInput): Promise<string> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO proveedores (nombre, razon_social, ruc, email_contacto, telefono)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text AS id`,
      [
        input.nombre,
        input.razonSocial ?? null,
        input.ruc ?? null,
        input.email ?? null,
        input.telefono ?? null,
      ],
    );
    return row!.id;
  } catch (error) {
    if (isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) {
      throw new ProveedorError("Ya existe un proveedor con ese nombre o RUC.");
    }
    throw error;
  }
}

export async function setProveedorActivo(id: string, activo: boolean): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE proveedores SET activo = $2 WHERE id = $1 RETURNING id::text AS id`,
    [id, activo],
  );
  return row !== null;
}
