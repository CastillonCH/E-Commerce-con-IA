import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSession, canManageProducts } from "@/lib/auth";

const ADMIN_ONLY_PATHS = [
  "/admin/dashboard",
  "/admin/vendedores",
  "/admin/clientes",
  "/admin/pedidos",
];

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

  const requiresAdmin = ADMIN_ONLY_PATHS.some((path) =>
    pathname.startsWith(path),
  );
  if (requiresAdmin && session?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/admin/productos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
