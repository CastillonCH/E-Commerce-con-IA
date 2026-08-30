import { cookies } from "next/headers";
import type { UserRole } from "@/types";

export const SESSION_COOKIE = "session_role";

/**
 * Lee el rol de sesión desde una cookie plana. Es un placeholder para
 * desbloquear el desarrollo del frontend: el backend en FastAPI debe emitir
 * un JWT firmado y este helper (y `proxy.ts`) debe cambiarse para verificar
 * ese token en lugar de confiar en el valor plano de la cookie.
 */
export function readSessionRole(
  cookieValue: string | undefined
): UserRole | null {
  return cookieValue === "ADMIN" || cookieValue === "CLIENT"
    ? cookieValue
    : null;
}

/** Helper para Server Components: rol de la sesión actual, o null si no hay sesión. */
export async function getSessionRole(): Promise<UserRole | null> {
  const store = await cookies();
  return readSessionRole(store.get(SESSION_COOKIE)?.value);
}
