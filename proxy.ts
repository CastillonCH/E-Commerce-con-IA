import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionRole } from "@/lib/auth";

/**
 * Protege /admin a nivel de servidor (Next.js 16 renombró `middleware.ts` a
 * `proxy.ts`). Hoy solo verifica una cookie plana; cuando exista el backend,
 * cambiar `readSessionRole` para verificar el JWT firmado que emita FastAPI.
 */
export function proxy(request: NextRequest) {
  const role = readSessionRole(request.cookies.get(SESSION_COOKIE)?.value);

  if (role !== "ADMIN") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
