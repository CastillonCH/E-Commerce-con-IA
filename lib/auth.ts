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

export function canManageProducts(role: UserRole | null): boolean {
  return role === "ADMIN" || role === "SELLER";
}

export function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export function readSession(cookieValue: string | undefined): Session | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString(),
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
  } catch {}
  return null;
}

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
