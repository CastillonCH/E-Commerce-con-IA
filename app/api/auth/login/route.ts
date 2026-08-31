import { NextResponse } from "next/server";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/lib/auth";

/**
 * Login de CLIENTES (correo). Es un stub SOLO para desarrollo del frontend:
 * acepta cualquier contraseña y no persiste nada.
 *
 * TODO(backend): reemplazar por un POST a `${APP_CONFIG.apiUrl}/api/auth/login`
 * en FastAPI que valide credenciales reales contra la base de datos y
 * devuelva un JWT. Ese token debe guardarse en una cookie httpOnly firmada
 * y verificarse en `proxy.ts`, no confiar en JSON plano como aquí.
 *
 * El staff (vendedor/administrador) NO usa este endpoint — ver
 * /api/auth/staff-login, que no está enlazado desde la tienda pública.
 */
export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { detail: "Email y contraseña son obligatorios" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      role: "CLIENT",
      name: email.split("@")[0],
      email,
      provider: "credentials",
    }),
    sessionCookieOptions()
  );
  return response;
}
