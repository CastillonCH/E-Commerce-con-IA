import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { createClient } from "@/lib/data/users-repo";

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { detail: "Nombre, email y contraseña son obligatorios (contraseña: mínimo 6 caracteres)" },
      { status: 400 },
    );
  }

  let user;
  try {
    // Siempre crea una cuenta CLIENT — el registro público nunca puede
    // elegir rol.
    user = await createClient(parsed.data);
  } catch {
    return NextResponse.json(
      { detail: "Ya existe una cuenta con ese correo" },
      { status: 409 },
    );
  }

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
