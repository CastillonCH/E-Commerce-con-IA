import "server-only";
import { randomInt } from "crypto";
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
  // false = cuenta desactivada: no puede iniciar sesión.
  activo: boolean;
  // true = tiene una contraseña temporal y debe cambiarla al ingresar.
  debeCambiarPassword: boolean;
}

interface UsuarioRow {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  password_hash: string | null;
  creado_en: Date;
  activo: boolean;
  debe_cambiar_password: boolean;
}

function toUserRecord(row: UsuarioRow): UserRecord {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    role: row.rol,
    passwordHash: row.password_hash ?? "",
    fechaRegistro: row.creado_en.toISOString().slice(0, 10),
    activo: row.activo,
    debeCambiarPassword: row.debe_cambiar_password,
  };
}

const COLUMNAS = `id::text, nombre, email::text, rol, password_hash, creado_en, activo, debe_cambiar_password`;

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  // `email` es citext en la base: la comparación ya ignora mayúsculas/minúsculas.
  const row = await queryOne<UsuarioRow>(
    `SELECT ${COLUMNAS}
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
       RETURNING ${COLUMNAS}`,
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
     RETURNING ${COLUMNAS}`,
    [input.name, input.email.trim(), input.sub],
  );
  return toUserRecord(row!);
}

export async function listClients(): Promise<UserRecord[]> {
  const rows = await query<UsuarioRow>(
    `SELECT ${COLUMNAS}
       FROM usuarios WHERE rol = 'CLIENT' ORDER BY creado_en`,
  );
  return rows.map(toUserRecord);
}

// --- Cuentas del personal (/admin/personal) --------------------------------
// Los clientes se registran solos en /login; el personal NUNCA: lo crea un
// ADMIN con una contraseña temporal que se debe cambiar al primer ingreso
// (el administrador no conoce la contraseña definitiva de nadie). Una cuenta
// del personal no se borra: se desactiva, para conservar el historial de
// quién revisó o aprobó cada producto (revisado_por). La base garantiza que
// siempre quede al menos un ADMIN activo (trg_usuarios_ultimo_admin).

export type RolPersonal = "ADMIN" | "CATALOGO";

export interface MiembroPersonal {
  id: string;
  nombre: string;
  email: string;
  rol: RolPersonal;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export class PersonalError extends Error {}

export async function listPersonal(): Promise<MiembroPersonal[]> {
  const rows = await query<{
    id: string;
    nombre: string;
    email: string;
    rol: RolPersonal;
    activo: boolean;
    debe_cambiar_password: boolean;
    ultimo_acceso: Date | null;
    creado_en: Date;
  }>(
    `SELECT id::text, nombre, email::text, rol, activo, debe_cambiar_password, ultimo_acceso, creado_en
       FROM usuarios
      WHERE rol <> 'CLIENT'
      ORDER BY activo DESC, rol, nombre`,
  );
  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    activo: row.activo,
    debeCambiarPassword: row.debe_cambiar_password,
    ultimoAcceso: row.ultimo_acceso?.toISOString() ?? null,
    creadoEn: row.creado_en.toISOString(),
  }));
}

// Sin caracteres que se confunden al dictarla o copiarla (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal aleatoria (criptográficamente segura). */
export function generarPasswordTemporal(longitud = 12): string {
  return Array.from({ length: longitud }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
}

/**
 * Crea una cuenta del personal con una contraseña temporal. Devuelve esa
 * contraseña UNA sola vez, para que el administrador se la entregue al
 * empleado; en la base solo queda su hash.
 */
export async function crearMiembroPersonal(input: {
  nombre: string;
  email: string;
  rol: RolPersonal;
}): Promise<{ id: string; passwordTemporal: string }> {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO usuarios (nombre, email, password_hash, proveedor, rol, debe_cambiar_password)
       VALUES ($1, $2, $3, 'credentials', $4, true)
       RETURNING id::text AS id`,
      [input.nombre, input.email.trim(), passwordHash, input.rol],
    );
    return { id: row!.id, passwordTemporal };
  } catch (error) {
    if (isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) {
      throw new PersonalError(
        "Ya existe una cuenta con ese correo. Si es de un cliente, el empleado debe usar otro correo (el de la empresa).",
      );
    }
    throw error;
  }
}

async function actualizarMiembro(
  id: string,
  actorEmail: string,
  set: string,
  params: unknown[],
): Promise<void> {
  const actor = await findUserByEmail(actorEmail);
  if (actor?.id === id) {
    throw new PersonalError("No puedes cambiar tu propia cuenta desde aquí.");
  }
  try {
    const row = await queryOne<{ id: string }>(
      `UPDATE usuarios SET ${set} WHERE id = $1 AND rol <> 'CLIENT' RETURNING id::text AS id`,
      [id, ...params],
    );
    if (!row) throw new PersonalError("Esa cuenta no existe o no es del personal.");
  } catch (error) {
    if (isPgError(error, PG_ERROR.CHECK_VIOLATION)) {
      throw new PersonalError("Debe quedar al menos un administrador activo.");
    }
    throw error;
  }
}

/** Activa o desactiva una cuenta del personal (nunca la propia). */
export async function setMiembroActivo(id: string, activo: boolean, actorEmail: string): Promise<void> {
  await actualizarMiembro(id, actorEmail, "activo = $2", [activo]);
}

/** Cambia el rol entre ADMIN y CATALOGO (nunca el propio). */
export async function setMiembroRol(id: string, rol: RolPersonal, actorEmail: string): Promise<void> {
  await actualizarMiembro(id, actorEmail, "rol = $2", [rol]);
}

/**
 * Para quien olvidó su contraseña: genera una temporal nueva y lo obliga a
 * cambiarla al ingresar. Devuelve la temporal una sola vez.
 */
export async function restablecerPasswordMiembro(id: string, actorEmail: string): Promise<string> {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);
  await actualizarMiembro(id, actorEmail, "password_hash = $2, debe_cambiar_password = true", [passwordHash]);
  return passwordTemporal;
}

/** Cambio de contraseña del propio usuario (verifica la actual). */
export async function cambiarPassword(
  email: string,
  actual: string,
  nueva: string,
): Promise<"ok" | "actual_incorrecta" | "igual_a_la_actual"> {
  const usuario = await findUserByEmail(email);
  if (!usuario || !(await verifyPassword(usuario, actual))) return "actual_incorrecta";
  if (actual === nueva) return "igual_a_la_actual";
  const passwordHash = await bcrypt.hash(nueva, 10);
  await query(
    `UPDATE usuarios SET password_hash = $2, debe_cambiar_password = false WHERE id = $1`,
    [usuario.id, passwordHash],
  );
  return "ok";
}

export async function registrarAcceso(id: string): Promise<void> {
  await query(`UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, [id]);
}
