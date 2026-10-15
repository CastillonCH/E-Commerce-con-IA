import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { findUserByEmail, verifyPassword } from "@/lib/data/users-repo";

// Deliberadamente SIN campo `role`: Zod descarta cualquier `role` que venga
// en el body (comportamiento por defecto al no declarar la clave), así que
// el rol SIEMPRE sale de usersRepo, nunca de lo que el cliente envíe. Ver
// route.test.ts para la prueba que fija este comportamiento.
const staffLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = staffLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ detail: "Datos inválidos" }, { status: 400 });
  }

  const user = await findUserByEmail(parsed.data.email);
  const genericError = NextResponse.json(
    { detail: "Email o contraseña incorrectos" },
    { status: 401 },
  );

  if (!user || user.role === "CLIENT") return genericError;
  if (!(await verifyPassword(user, parsed.data.password))) return genericError;

  const token = await createSessionToken({
    role: user.role,
    name: user.nombre,
    email: user.email,
    provider: "credentials",
  });

  const response = NextResponse.json({ success: true, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
