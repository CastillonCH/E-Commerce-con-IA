import { NextResponse } from "next/server";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/lib/auth";
import type { UserRole } from "@/types";

/**
 * Login de STAFF (vendedor/administrador). Solo lo llama `/admin/login`,
 * que no está enlazado desde la tienda pública — así un cliente nunca ve
 * ni puede llegar a un selector de rol.
 *
 * IMPORTANTE: aquí el rol viene del propio formulario porque no hay backend
 * todavía; es SOLO para poder demostrar las dos vistas (vendedor y admin)
 * sin base de datos. En el backend real, el rol NUNCA debe leerse de algo
 * que envía el cliente — debe derivarse del registro del usuario ya
 * autenticado en FastAPI (y esa llamada sí debe validar contraseña real).
 */
export async function POST(request: Request) {
  const { email, role } = await request.json();

  if (!email || (role !== "ADMIN" && role !== "SELLER")) {
    return NextResponse.json({ detail: "Datos inválidos" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, role });
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      role: role as UserRole,
      name: email.split("@")[0],
      email,
      provider: "credentials",
    }),
    sessionCookieOptions()
  );
  return response;
}
