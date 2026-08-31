import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSession, canManageProducts } from "@/lib/auth";

const ADMIN_ONLY_PATHS = ["/admin/dashboard", "/admin/vendedores"];

/**
 * Protege /admin a nivel de servidor (Next.js 16 renombró `middleware.ts` a
 * `proxy.ts`). Hoy solo decodifica una cookie propia; cuando exista el
 * backend, cambiar `readSession` para verificar el JWT firmado que emita
 * FastAPI en lugar de confiar en un valor sin firmar.
 *
 * Reglas:
 * - /admin/login es pública (si no, nadie podría loguearse).
 * - El resto de /admin requiere sesión de SELLER o ADMIN.
 * - Dashboard de métricas y aprobación de vendedores: solo ADMIN. Un
 *   SELLER autenticado que intenta entrar se redirige a su propia área
 *   (/admin/productos) en vez de al login, para no tratarlo como intruso.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!canManageProducts(session?.role ?? null)) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requiresAdmin = ADMIN_ONLY_PATHS.some((path) => pathname.startsWith(path));
  if (requiresAdmin && session?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/admin/productos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
