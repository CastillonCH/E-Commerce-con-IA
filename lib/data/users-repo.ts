import "server-only";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/types";
import { query, queryOne, isPgError, PG_ERROR } from "@/lib/db";

export interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  fechaRegistro: string;
}

interface UsuarioRow {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  password_hash: string | null;
  creado_en: Date;
}

function toUserRecord(row: UsuarioRow): UserRecord {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    role: row.rol,
    passwordHash: row.password_hash ?? "",
    fechaRegistro: row.creado_en.toISOString().slice(0, 10),
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  // `email` es citext en la base: la comparación ya ignora mayúsculas/minúsculas.
  const row = await queryOne<UsuarioRow>(
    `SELECT id::text, nombre, email::text, rol, password_hash, creado_en
       FROM usuarios WHERE email = $1`,
    [email.trim()],
  );
  return row ? toUserRecord(row) : null;
}

export async function verifyPassword(
  user: UserRecord,
  password: string,
): Promise<boolean> {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function createClient(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserRecord> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const row = await queryOne<UsuarioRow>(
      `INSERT INTO usuarios (nombre, email, password_hash, proveedor, rol)
       VALUES ($1, $2, $3, 'credentials', 'CLIENT')
       RETURNING id::text, nombre, email::text, rol, password_hash, creado_en`,
      [input.name, input.email.trim(), passwordHash],
    );
    return toUserRecord(row!);
  } catch (error) {
    if (isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) {
      throw new Error("Ya existe una cuenta con ese correo");
    }
    throw error;
  }
}

export async function upsertGoogleUser(input: {
  sub: string;
  email: string;
  name: string;
}): Promise<UserRecord> {
  const existing = await findUserByEmail(input.email);
  if (existing) return existing;

  const row = await queryOne<UsuarioRow>(
    `INSERT INTO usuarios (nombre, email, proveedor, google_sub, rol)
     VALUES ($1, $2, 'google', $3, 'CLIENT')
     RETURNING id::text, nombre, email::text, rol, password_hash, creado_en`,
    [input.name, input.email.trim(), input.sub],
  );
  return toUserRecord(row!);
}

// Aprueba (o crea ya aprobada) la ficha de vendedor de un usuario; el
// trigger trg_vendedores_sync_rol de la base pasa su rol a SELLER.
export async function promoteToSeller(input: {
  email: string;
  nombre: string;
}): Promise<UserRecord> {
  let usuario = await findUserByEmail(input.email);
  usuario ??= await createClient({
    name: input.nombre,
    email: input.email,
    password: crypto.randomUUID(),
  });

  await query(
    `INSERT INTO vendedores (usuario_id, nombre_comercial, estado)
     VALUES ($1, $2, 'aprobado')
     ON CONFLICT (usuario_id)
     DO UPDATE SET estado = 'aprobado', nombre_comercial = EXCLUDED.nombre_comercial`,
    [usuario.id, input.nombre],
  );

  const updated = await findUserByEmail(input.email);
  return updated!;
}

// vendedores.nombre_comercial (el nombre de la tienda) no tiene por qué
// coincidir con el texto de `marca` en un producto ("SoundMax Perú" vs.
// "SoundMax"): este es el único vínculo confiable entre una sesión SELLER y
// su fila en `vendedores` — usado por products-repo.ts al dar de alta un
// producto.
export async function getVendedorIdByEmail(email: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT v.id::text AS id
       FROM vendedores v
       JOIN usuarios u ON u.id = v.usuario_id
      WHERE u.email = $1 AND v.estado = 'aprobado'`,
    [email.trim()],
  );
  return row?.id ?? null;
}

export async function listClients(): Promise<UserRecord[]> {
  const rows = await query<UsuarioRow>(
    `SELECT id::text, nombre, email::text, rol, password_hash, creado_en
       FROM usuarios WHERE rol = 'CLIENT' ORDER BY creado_en`,
  );
  return rows.map(toUserRecord);
}

export async function listSellers(): Promise<UserRecord[]> {
  const rows = await query<UsuarioRow>(
    `SELECT id::text, nombre, email::text, rol, password_hash, creado_en
       FROM usuarios WHERE rol = 'SELLER' ORDER BY creado_en`,
  );
  return rows.map(toUserRecord);
}
