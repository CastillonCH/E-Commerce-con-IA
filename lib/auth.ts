export const SESSION_COOKIE = "session_role";

/**
 * Lee el rol de sesión desde una cookie plana. Es un placeholder para
 * desbloquear el desarrollo del frontend: el backend en FastAPI debe emitir
 * un JWT firmado y este helper (y `proxy.ts`) debe cambiarse para verificar
 * ese token en lugar de confiar en el valor plano de la cookie.
 */
export function readSessionRole(cookieValue: string | undefined) {
  return cookieValue === "ADMIN" || cookieValue === "CLIENT"
    ? cookieValue
    : null;
}
