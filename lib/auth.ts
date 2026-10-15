import { cookies } from "next/headers";
import type { UserRole } from "@/types";
import { signSession, verifySession, type SessionPayload } from "@/lib/session";

export const SESSION_COOKIE = "session";

export type Session = SessionPayload;

export function canManageProducts(role: UserRole | null): boolean {
  return role === "ADMIN" || role === "SELLER";
}

/** Firma un JWT de sesión nuevo (llamado desde las rutas de login/registro). */
export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return signSession(payload);
}

/** Helper para Server Components: sesión actual (JWT verificado), o null si no hay sesión válida. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  };
}
