import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { detail: "Email y contraseña son obligatorios" },
      { status: 400 },
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
    sessionCookieOptions(),
  );
  return response;
}
