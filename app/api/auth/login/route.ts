import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { findUserByEmail, registrarAcceso, verifyPassword } from "@/lib/data/users-repo";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// Login de la tienda: SOLO clientes. El personal (ADMIN/CATALOGO) entra por
// /admin/login (api/auth/staff-login), con su sesión más corta. Así cada
// puerta deja pasar únicamente a quien le corresponde, en los dos sentidos.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Datos inválidos" }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.data.email);
  const genericError = NextResponse.json(
    { detail: "Email o contraseña incorrectos" },
    { status: 401 },
  );
  if (!user) return genericError;
  if (!(await verifyPassword(user, parsed.data.password))) return genericError;

  // Recién con la contraseña correcta se dice que es una cuenta del
  // personal: antes de eso cualquiera podría usarlo para averiguar qué
  // correos son de administradores.
  if (user.role !== "CLIENT") {
    return NextResponse.json(
      {
        detail: "Esta cuenta es del personal de NovaStore. Ingresa por el acceso interno.",
        staff: true,
      },
      { status: 403 },
    );
  }

  // Cuenta desactivada por un administrador: recién con la contraseña
  // correcta se dice por qué no entra.
  if (!user.activo) {
    return NextResponse.json(
      { detail: "Esta cuenta está desactivada. Contacta al administrador de NovaStore." },
      { status: 403 },
    );
  }

  await registrarAcceso(user.id);

  const token = await createSessionToken({
    role: user.role,
    name: user.nombre,
    email: user.email,
    provider: "credentials",
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(user.role));
  return response;
}
