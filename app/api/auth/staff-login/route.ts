import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  encodeSession,
  sessionCookieOptions,
} from "@/lib/auth";
import type { UserRole } from "@/types";

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
    sessionCookieOptions(),
  );
  return response;
}
