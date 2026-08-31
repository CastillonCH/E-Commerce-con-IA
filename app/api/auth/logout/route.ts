import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "@/lib/auth";

export async function POST(request: Request) {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  const destination = session && session.role !== "CLIENT" ? "/admin/login" : "/login";

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
