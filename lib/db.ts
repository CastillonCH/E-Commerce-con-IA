import "server-only";
import { Pool, types } from "pg";

// Los campos `numeric`/`decimal` de Postgres vienen como string por defecto
// (para no perder precisión en valores arbitrarios). A esta escala —precios
// en soles— un float es más que suficiente y evita que cada repo tenga que
// hacer parseFloat() a mano en cada columna numérica.
types.setTypeParser(1700 /* numeric */, (value: string) => parseFloat(value));

let pool: Pool | undefined;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no está definido. Define la cadena de conexión a PostgreSQL en .env.local (ver .env.example).",
    );
  }
  return url;
}

function getPool(): Pool {
  pool ??= new Pool({ connectionString: getConnectionString() });
  return pool;
}

/** Solo para tests: cierra el pool para que el proceso de Vitest no quede colgado. */
export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Códigos de error de Postgres que los repos necesitan distinguir. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
} as const;

export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
