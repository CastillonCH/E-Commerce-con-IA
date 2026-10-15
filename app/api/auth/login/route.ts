import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { findUserByEmail, verifyPassword } from "@/lib/data/users-repo";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

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

  const token = await createSessionToken({
    role: user.role,
    name: user.nombre,
    email: user.email,
    provider: "credentials",
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
