"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Search,
  ShoppingCart,
  User,
  UserPlus,
  ChevronDown,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Smartphone,
  Sofa,
  Shirt,
  Dumbbell,
  Sparkles,
  Blocks,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import { DEPARTAMENTOS, type Departamento } from "@/types";
import type { Session } from "@/lib/auth";
import { useCartStore } from "@/store/cart-store";
import { useHasMounted } from "@/hooks/useHasMounted";
import { cn } from "@/lib/utils";
import { DepartmentMegaMenu } from "@/components/shop/DepartmentMegaMenu";

const DEPARTMENT_ICONS: Record<Departamento, LucideIcon> = {
  Electronica: Smartphone,
  Hogar: Sofa,
  Moda: Shirt,
  Deportes: Dumbbell,
  Belleza: Sparkles,
  Juguetes: Blocks,
  Supermercado: ShoppingBasket,
};

interface NavbarProps {
  session: Session | null;
}

/**
 * Navbar minimalista al estilo Samsung.com: sin barra de utilidad ni
 * franjas oscuras — solo el logo, los departamentos como enlaces directos
 * (cada uno revela un mega-menú con productos reales al pasar el cursor),
 * una búsqueda liviana y tres íconos planos. `session` viene del layout del
 * servidor (lee la cookie de sesión) para que el estado de login sea
 * correcto en el primer render, sin parpadeos de hidratación.
 */
export function Navbar({ session }: NavbarProps) {
  const totalItems = useCartStore((state) => state.totalItems());
  const mounted = useHasMounted();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm">
      {/* Mini fila superior, al estilo "Soporte" de Samsung. El acceso de
          staff (/admin/login) NO se enlaza aquí a propósito: nunca se
          anuncia una puerta de administrador en el sitio público. */}
      <div className="hidden border-b border-slate-50 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-5 px-6 py-1.5 text-xs text-slate-500">
          <Link href="/ayuda" className="hover:text-brand">Ayuda</Link>
        </div>
      </div>

      {/* Barra principal */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:flex-nowrap sm:gap-6 sm:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="shrink-0 text-2xl font-extrabold tracking-tight text-slate-900">
          {/* ESPACIO PARA LOGO / NOMBRE DE LA TIENDA */}
          Nova<span className="text-brand">Store</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {DEPARTAMENTOS.map((departamento) => (
            <div key={departamento} className="group/dept relative">
              <Link
                href={`/?categoria=${departamento}`}
                className="relative flex items-center px-3 py-2 text-sm font-medium text-slate-800"
              >
                {departamento}
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-200 group-hover/dept:scale-x-100" />
              </Link>
              <DepartmentMegaMenu departamento={departamento} />
            </div>
          ))}
        </nav>

        <form action="/" className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:ml-auto sm:w-auto sm:max-w-xs sm:flex-1">
          <div className="flex w-full items-center rounded-full border border-transparent bg-slate-100 px-4 transition-colors focus-within:border-brand focus-within:bg-white focus-within:ring-1 focus-within:ring-brand">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              type="search"
              name="q"
              placeholder="Buscar productos..."
              className="w-full bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              onBlur={() => setTimeout(() => setAccountOpen(false), 150)}
              className="flex items-center gap-1.5 rounded-full p-2 text-slate-700 hover:bg-slate-100"
              aria-label="Cuenta"
            >
              {session ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
                  {session.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <User className="h-5 w-5" />
              )}
              <ChevronDown className={cn("hidden h-3.5 w-3.5 transition-transform sm:block", accountOpen && "rotate-180")} />
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right animate-[scale-in_0.15s_ease-out] overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
                {session ? (
                  <>
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <p className="truncate text-sm font-medium text-slate-900">{session.name}</p>
                      <p className="truncate text-xs text-slate-500">{session.email}</p>
                    </div>
                    <Link href="/perfil" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <User className="h-4 w-4" />
                      Mi Perfil
                    </Link>
                    {session.role !== "CLIENT" && (
                      <Link
                        href={session.role === "ADMIN" ? "/admin/dashboard" : "/admin/productos"}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Panel {session.role === "ADMIN" ? "de administrador" : "de vendedor"}
                      </Link>
                    )}
                    <form action="/api/auth/logout" method="post">
                      <button type="submit" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                        <LogOut className="h-4 w-4" />
                        Cerrar sesión
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <User className="h-4 w-4" />
                      Iniciar sesión
                    </Link>
                    <Link href="/login?tab=register" className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-slate-50">
                      <UserPlus className="h-4 w-4" />
                      Crear cuenta
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <Link
            href="/carrito"
            className="relative flex items-center gap-2 rounded-full p-2 text-slate-700 hover:bg-slate-100"
            aria-label="Carrito"
          >
            <ShoppingCart className="h-5 w-5" />
            {mounted && totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-semibold text-white ring-2 ring-white">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Menú móvil */}
      {mobileOpen && (
        <div className="border-b border-slate-100 bg-white px-4 py-3 lg:hidden">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Categorías
          </p>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {DEPARTAMENTOS.map((departamento) => {
              const Icon = DEPARTMENT_ICONS[departamento];
              return (
                <Link
                  key={departamento}
                  href={`/?categoria=${departamento}`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  {departamento}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
            <Link href="/ayuda" className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Ayuda
            </Link>
            {session ? (
              <>
                <Link href="/perfil" className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Hola, {session.name.split(" ")[0]}
                </Link>
                {session.role !== "CLIENT" && (
                  <Link
                    href={session.role === "ADMIN" ? "/admin/dashboard" : "/admin/productos"}
                    className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Panel {session.role === "ADMIN" ? "de administrador" : "de vendedor"}
                  </Link>
                )}
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="w-full rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    Cerrar sesión
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
