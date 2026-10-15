import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@/types";
import { getServerEnv } from "@/lib/env.server";

/**
 * Único lugar que firma/verifica el JWT de sesión. Cuando exista el backend
 * en FastAPI, el token lo emitirá él (mismo secreto compartido o JWKS); esta
 * función `verifySession` seguirá siendo la única que Next.js necesita tocar
 * para dejar de confiar en una cookie sin firmar y empezar a verificar un
 * token real, sin cambiar ningún llamador (`lib/auth.ts`, `proxy.ts`).
 */

const ALGORITHM = "HS256";
const EXPIRATION = "8h";
const VALID_ROLES: UserRole[] = ["ADMIN", "SELLER", "CLIENT"];

export interface SessionPayload {
  role: UserRole;
  name: string;
  email: string;
  provider: "credentials" | "google";
}

function getSecretKey(): Uint8Array {
  const { AUTH_SECRET } = getServerEnv();
  return new TextEncoder().encode(AUTH_SECRET);
}

function isSessionPayload(
  payload: JWTPayload,
): payload is JWTPayload & SessionPayload {
  return (
    typeof payload.role === "string" &&
    VALID_ROLES.includes(payload.role as UserRole) &&
    typeof payload.name === "string" &&
    typeof payload.email === "string" &&
    (payload.provider === "google" || payload.provider === "credentials")
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(getSecretKey());
}

/**
 * Verifica la firma y la expiración del JWT. Cualquier cookie manipulada a
 * mano, expirada o firmada con otro secreto devuelve `null` en vez de un
 * objeto de sesión — a diferencia del `readSession` anterior, que solo
 * decodificaba base64 sin comprobar nada.
 */
export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [ALGORITHM],
    });
    if (!isSessionPayload(payload)) return null;
    return {
      role: payload.role,
      name: payload.name,
      email: payload.email,
      provider: payload.provider,
    };
  } catch {
    return null;
  }
}
