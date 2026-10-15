import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { verifySession } from "@/lib/session";

export async function POST(request: Request) {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  const destination =
    session && session.role !== "CLIENT" ? "/admin/login" : "/login";

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
