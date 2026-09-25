import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json(
      { detail: "Nombre, email y contraseña son obligatorios" },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({ role: "CLIENT", name, email, provider: "credentials" }),
    sessionCookieOptions(),
  );
  return response;
}
