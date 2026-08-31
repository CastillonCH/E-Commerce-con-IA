import { NextResponse } from "next/server";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/lib/auth";

/**
 * Registro de CLIENTES. Stub SOLO para desarrollo del frontend: no persiste
 * nada y crea sesión inmediatamente. Todo registro público es siempre
 * CLIENT — nunca permitir que un formulario público elija su propio rol.
 *
 * TODO(backend): reemplazar por un POST a `${APP_CONFIG.apiUrl}/api/auth/registro`
 * en FastAPI, que debe hashear la contraseña (nunca guardarla en texto plano)
 * y devolver el JWT real.
 */
export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json(
      { detail: "Nombre, email y contraseña son obligatorios" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({ role: "CLIENT", name, email, provider: "credentials" }),
    sessionCookieOptions()
  );
  return response;
}
