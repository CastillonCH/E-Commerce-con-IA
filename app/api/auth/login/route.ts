import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Stub de autenticación SOLO para desarrollo del frontend. Acepta cualquier
 * credencial y asigna el rol según a dónde intentaba entrar el usuario
 * (`/admin/...` -> ADMIN, cualquier otra ruta -> CLIENT).
 *
 * TODO(backend): reemplazar por un POST a `${APP_CONFIG.apiUrl}/api/auth/login`
 * en FastAPI, que debe validar credenciales reales y devolver un JWT con el
 * rol del usuario. Ese token debe guardarse en una cookie httpOnly firmada y
 * verificarse en `proxy.ts`, no confiar en un valor plano como aquí.
 */
export async function POST(request: Request) {
  const { email, from } = await request.json();

  if (!email) {
    return NextResponse.json({ detail: "Email requerido" }, { status: 400 });
  }

  const role = typeof from === "string" && from.startsWith("/admin") ? "ADMIN" : "CLIENT";

  const response = NextResponse.json({ success: true, role });
  response.cookies.set(SESSION_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
