import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, canManageProducts } from "@/lib/auth";
import { verifySession } from "@/lib/session";

const ADMIN_ONLY_PATHS = [
  "/admin/dashboard",
  "/admin/vendedores",
  "/admin/clientes",
  "/admin/pedidos",
  "/admin/revision",
  "/admin/duplicados",
];

/**
 * Comprobación OPTIMISTA: solo decide si deja pasar la request o redirige
 * al login, a partir de la cookie de sesión. No es la última palabra —
 * cada Server Component/Action/route handler que lee o muta datos vuelve a
 * comprobar el rol por su cuenta (defensa en profundidad), y eventualmente
 * lo hará también el backend real. proxy.ts no puede, por sí solo,
 * garantizar autorización: solo evita que una request sin sesión llegue a
 * renderizar una página protegida.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname.startsWith("/admin")) {
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

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/perfil/:path*", "/checkout"],
};
