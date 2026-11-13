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
  ChevronUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/config";
import type { Session } from "@/lib/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface ItemMenu {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
}

// Agrupado por tema para que se lea de un vistazo. Una sección sin ítems
// visibles para el rol no se muestra (CATALOGO solo ve "Catálogo").
const SECCIONES: { titulo: string; items: ItemMenu[] }[] = [
  {
    titulo: "Catálogo",
    items: [
      { href: "/admin/productos/nuevo", label: "Nuevo producto", icon: PackagePlus, adminOnly: false },
      { href: "/admin/productos", label: "Productos", icon: Package, adminOnly: false },
      { href: "/admin/proveedores", label: "Proveedores", icon: Truck, adminOnly: true },
    ],
  },
  {
    titulo: "Inteligencia artificial",
    items: [
      { href: "/admin/revision", label: "Revisión de IA", icon: Sparkles, adminOnly: true },
      { href: "/admin/duplicados", label: "Duplicados", icon: Copy, adminOnly: true },
      { href: "/admin/modelos", label: "Modelos de IA", icon: BrainCircuit, adminOnly: true },
    ],
  },
  {
    titulo: "Ventas",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
      { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, adminOnly: true },
      { href: "/admin/clientes", label: "Clientes", icon: Users, adminOnly: true },
    ],
  },
  {
    titulo: "Equipo",
    items: [{ href: "/admin/personal", label: "Personal", icon: UserCog, adminOnly: true }],
  },
];

const ETIQUETA_ROL: Record<string, string> = { ADMIN: "Administrador", CATALOGO: "Catálogo" };

// El enlace activo es el de ruta más larga que coincide: así
// /admin/productos/5/editar marca "Productos" y /admin/productos/nuevo
// marca "Nuevo producto" (y no los dos).
function activeHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

const ITEM_CUENTA =
  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100";

export function AdminSidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const secciones = SECCIONES.map((seccion) => ({
    ...seccion,
    items: seccion.items.filter((item) => !item.adminOnly || session.role === "ADMIN"),
  })).filter((seccion) => seccion.items.length > 0);
  const activo = activeHref(pathname, secciones.flatMap((s) => s.items.map((item) => item.href)));
  const panel = session.role === "ADMIN" ? "Panel de administrador" : "Panel de catálogo";

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const cerrarTodo = () => {
    setMobileOpen(false);
    setCuentaAbierta(false);
  };

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
          entra, y la cuenta siempre se ve abajo. */}
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

        <nav aria-label="Secciones del panel" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {secciones.map((seccion) => (
            <div key={seccion.titulo}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {seccion.titulo}
              </p>
              <ul className="space-y-0.5">
                {seccion.items.map(({ href, label, icon: Icon }) => {
                  const isActive = href === activo;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={cerrarTodo}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Cuenta: una sola fila; lo demás (tienda, contraseña, tema y
            cerrar sesión) va en un menú que se abre hacia arriba. */}
        <div
          className="relative border-t border-slate-200 p-3"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCuentaAbierta(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setCuentaAbierta(false);
          }}
        >
          {cuentaAbierta && (
            <div
              id="menu-cuenta-panel"
              className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
            >
              <p className="truncate border-b border-slate-100 px-3 pb-2 pt-1 text-xs text-slate-500">
                {session.email}
              </p>
              <div className="py-1">
                <Link href="/" onClick={cerrarTodo} className={ITEM_CUENTA}>
                  <Store className="h-4 w-4" />
                  Ver tienda
                </Link>
                <Link href="/admin/cambiar-clave" onClick={cerrarTodo} className={ITEM_CUENTA}>
                  <KeyRound className="h-4 w-4" />
                  Cambiar contraseña
                </Link>
                <ThemeToggle showLabel className={cn(ITEM_CUENTA, "rounded-none p-0 px-3 py-2 [&_svg]:h-4 [&_svg]:w-4")} />
              </div>
              <form action="/api/auth/logout" method="post" className="border-t border-slate-100 pt-1">
                <button type="submit" className={cn(ITEM_CUENTA, "text-red-600 hover:bg-red-50")}>
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </form>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCuentaAbierta((abierta) => !abierta)}
            aria-haspopup="true"
            aria-expanded={cuentaAbierta}
            aria-controls="menu-cuenta-panel"
            aria-label={`Cuenta de ${session.name}`}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100",
              cuentaAbierta && "bg-slate-100",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {session.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{session.name}</span>
              <span className="block truncate text-xs text-slate-500">{ETIQUETA_ROL[session.role] ?? session.role}</span>
            </span>
            <ChevronUp
              className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", !cuentaAbierta && "rotate-180")}
            />
          </button>
        </div>
      </aside>
    </>
  );
}
