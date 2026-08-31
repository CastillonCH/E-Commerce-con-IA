import { cookies } from "next/headers";
import type { UserRole } from "@/types";

export const SESSION_COOKIE = "session";

const VALID_ROLES: UserRole[] = ["ADMIN", "SELLER", "CLIENT"];

export interface Session {
  role: UserRole;
  name: string;
  email: string;
  provider: "credentials" | "google";
}

/**
 * Roles que pueden gestionar inventario/productos (vendedor y administrador).
 * El dashboard de métricas y la aprobación de vendedores quedan solo para ADMIN.
 */
export function canManageProducts(role: UserRole | null): boolean {
  return role === "ADMIN" || role === "SELLER";
}

/** Codifica la sesión como base64url para guardarla en una cookie sin problemas de escapado. */
export function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

/**
 * Decodifica la cookie de sesión. Es un placeholder para desbloquear el
 * desarrollo del frontend: el backend en FastAPI debe emitir un JWT firmado
 * y este helper (y `proxy.ts`) debe cambiarse para verificar ese token —
 * nunca confiar en un valor de cookie sin firmar en producción.
 */
export function readSession(cookieValue: string | undefined): Session | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString()
    ) as Partial<Session>;
    if (
      typeof parsed.role === "string" &&
      VALID_ROLES.includes(parsed.role as UserRole) &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return {
        role: parsed.role as UserRole,
        name: parsed.name,
        email: parsed.email,
        provider: parsed.provider === "google" ? "google" : "credentials",
      };
    }
  } catch {
    // cookie corrupta o de un formato viejo: se trata como sesión inexistente
  }
  return null;
}

/** Helper para Server Components: sesión actual, o null si no hay sesión. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readSession(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };
}
