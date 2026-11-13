import { cache } from "react";
import { cookies } from "next/headers";
import type { UserRole } from "@/types";
import {
  sessionMaxAgeSeconds,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/session";

export const SESSION_COOKIE = "session";

export type Session = SessionPayload & {
  // true = entró con una contraseña temporal y debe cambiarla antes de
  // usar el panel (ver app/admin/(protected)/layout.tsx).
  debeCambiarPassword?: boolean;
};

/** Personal de NovaStore: entra al panel y gestiona productos. */
export function canManageProducts(role: UserRole | null): boolean {
  return role === "ADMIN" || role === "CATALOGO";
}

/** Firma un JWT de sesión nuevo (llamado desde las rutas de login/registro). */
export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return signSession(payload);
}

/**
 * Sesión actual, o null. Además de verificar el JWT, confirma contra la
 * base que la cuenta sigue existiendo y que su rol no cambió desde que se
 * inició sesión: si se borra una cuenta o se le cambia el rol (por ejemplo,
 * un empleado que deja de ser del personal), la sesión vieja deja de valer
 * en la siguiente petición (y no 2-8 horas después, cuando venza el token).
 *
 * `cache` (React) hace que la consulta corra una sola vez por petición
 * aunque layout, página y componentes llamen a getSession() cada uno.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Import dinámico: proxy.ts importa este módulo (SESSION_COOKIE,
  // canManageProducts) y no necesita arrastrar el cliente de PostgreSQL.
  const { findUserByEmail } = await import("@/lib/data/users-repo");
  const usuario = await findUserByEmail(session.email);
  // También se corta si la desactivaron: no espera a que venza el token.
  if (!usuario || !usuario.activo || usuario.role !== session.role) return null;

  return { ...session, name: usuario.nombre, debeCambiarPassword: usuario.debeCambiarPassword };
});

export function sessionCookieOptions(role: UserRole = "CLIENT") {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds(role),
  };
}
