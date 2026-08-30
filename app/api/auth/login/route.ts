import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Stub de autenticación SOLO para desarrollo del frontend. Acepta cualquier
 * credencial y marca la sesión como ADMIN.
 *
 * TODO(backend): reemplazar por un POST a `${APP_CONFIG.apiUrl}/api/auth/login`
 * en FastAPI, que debe devolver un JWT. Ese token debe guardarse en una cookie
 * httpOnly firmada y verificarse en `proxy.ts`, no confiar en un valor plano.
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ detail: "Email requerido" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "ADMIN", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
