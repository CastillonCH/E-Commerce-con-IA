"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackagePlus,
  Package,
  Users,
  ClipboardList,
  Sparkles,
  Copy,
  BrainCircuit,
  LogOut,
  Menu,
  Store,
  Truck,
  UserCog,
  KeyRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/config";
import type { Session } from "@/lib/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const NAV_ITEMS = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    adminOnly: true,
  },
  {
    href: "/admin/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    adminOnly: true,
  },
  {
    href: "/admin/revision",
    label: "Revisión de IA",
    icon: Sparkles,
    adminOnly: true,
  },
  {
    href: "/admin/duplicados",
    label: "Duplicados",
    icon: Copy,
    adminOnly: true,
  },
  {
    href: "/admin/modelos",
    label: "Modelos de IA",
    icon: BrainCircuit,
    adminOnly: true,
  },
  { href: "/admin/clientes", label: "Clientes", icon: Users, adminOnly: true },
  {
    href: "/admin/proveedores",
    label: "Proveedores",
    icon: Truck,
    adminOnly: true,
  },
  {
    href: "/admin/personal",
    label: "Personal",
    icon: UserCog,
    adminOnly: true,
  },
  {
    href: "/admin/productos/nuevo",
    label: "Nuevo producto",
    icon: PackagePlus,
    adminOnly: false,
  },
  {
    href: "/admin/productos",
    label: "Productos",
    icon: Package,
    adminOnly: false,
  },
];

// El enlace activo es el de ruta más larga que coincide: así
// /admin/productos/5/editar marca "Productos" y /admin/productos/nuevo
// marca "Nuevo producto" (y no los dos).
function activeHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function AdminSidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV_ITEMS.filter(
    (item) => !item.adminOnly || session.role === "ADMIN",
  );
  const activo = activeHref(pathname, items.map((item) => item.href));
  const panel = session.role === "ADMIN" ? "Panel de administrador" : "Panel de catálogo";

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* Celular/tablet: barra superior fija con botón de menú */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú del panel"
          aria-expanded={mobileOpen}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight text-slate-900">{APP_CONFIG.storeName}</p>
          <p className="text-xs text-slate-500">{panel}</p>
        </div>
      </div>

      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
        />
      )}

      {/* Escritorio: fija a la izquierda y del alto de la pantalla — solo
          se desplaza el contenido. El menú tiene su propio scroll si no
          entra, y el usuario/modo oscuro/cerrar sesión siempre se ven. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">{APP_CONFIG.storeName}</p>
            <p className="text-sm text-slate-500">{panel}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú del panel"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Secciones del panel" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive = href === activo;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {session.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {session.name}
              </p>
              <p className="truncate text-xs text-slate-500">{session.email}</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Store className="h-4 w-4" />
            Ver tienda
          </Link>
          <Link
            href="/admin/cambiar-clave"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <KeyRound className="h-4 w-4" />
            Cambiar contraseña
          </Link>
          <ThemeToggle
            showLabel
            className="w-full rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 [&_svg]:h-4 [&_svg]:w-4"
          />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
