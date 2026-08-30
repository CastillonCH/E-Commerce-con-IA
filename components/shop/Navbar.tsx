"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Search,
  ShoppingCart,
  User,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Package,
  HelpCircle,
  Truck,
  Smartphone,
  Sofa,
  Shirt,
  Dumbbell,
  Sparkles,
  Blocks,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import { DEPARTAMENTOS, type Departamento, type UserRole } from "@/types";
import { APP_CONFIG } from "@/lib/config";
import { useCartStore } from "@/store/cart-store";
import { useHasMounted } from "@/hooks/useHasMounted";
import { cn } from "@/lib/utils";

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
  role: UserRole | null;
}

/**
 * Navbar de tres niveles inspirada en grandes tiendas departamentales
 * (SagaFalabella) y en la sobriedad de marca de sitios como Samsung.com:
 * barra de utilidad, barra principal (logo + búsqueda + cuenta + carrito)
 * y una franja de categorías con ícono. `role` viene del layout del lado
 * del servidor (lee la cookie de sesión) para que el estado de login sea
 * correcto en el primer render, sin parpadeos de hidratación.
 */
export function Navbar({ role }: NavbarProps) {
  const totalItems = useCartStore((state) => state.totalItems());
  const mounted = useHasMounted();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      {/* Barra de utilidad */}
      <div className="hidden bg-slate-950 text-slate-300 sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-xs sm:px-6">
          <p className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Envío gratis desde {APP_CONFIG.freeShippingThreshold} soles · Entregas a todo el Perú
          </p>
          <div className="flex items-center gap-4">
            <Link href="/ayuda" className="flex items-center gap-1 hover:text-white">
              <HelpCircle className="h-3.5 w-3.5" />
              Ayuda
            </Link>
            {role ? (
              <Link href={role === "ADMIN" ? "/admin/dashboard" : "/perfil"} className="hover:text-white">
                Mi cuenta
              </Link>
            ) : (
              <Link href="/login" className="hover:text-white">
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Barra principal */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="shrink-0 text-2xl font-extrabold tracking-tight text-slate-900">
          {/* ESPACIO PARA LOGO / NOMBRE DE LA TIENDA */}
          Nova<span className="text-blue-600">Store</span>
        </Link>

        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setCategoriesOpen((v) => !v)}
            onBlur={() => setTimeout(() => setCategoriesOpen(false), 150)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Menu className="h-4 w-4" />
            Categorías
            <ChevronDown className={cn("h-4 w-4 transition-transform", categoriesOpen && "rotate-180")} />
          </button>
          {categoriesOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
              {DEPARTAMENTOS.map((departamento) => {
                const Icon = DEPARTMENT_ICONS[departamento];
                return (
                  <Link
                    key={departamento}
                    href={`/?categoria=${departamento}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Icon className="h-4 w-4 text-slate-500" />
                    {departamento}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <form action="/" className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex w-full items-center rounded-lg border border-slate-300 bg-slate-50 px-3 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-600">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder="Buscar productos, marcas y más..."
              className="w-full bg-transparent px-2 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        </form>

        <div className="flex shrink-0 items-center gap-1">
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              onBlur={() => setTimeout(() => setAccountOpen(false), 150)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <User className="h-5 w-5" />
              <span className="hidden lg:inline">{role ? "Mi cuenta" : "Iniciar sesión"}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", accountOpen && "rotate-180")} />
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
                {role ? (
                  <>
                    <Link href="/perfil" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <User className="h-4 w-4" />
                      Mi Perfil
                    </Link>
                    {role === "ADMIN" && (
                      <Link href="/admin/dashboard" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                        <Package className="h-4 w-4" />
                        Panel admin
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
                  <Link href="/login" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    <User className="h-4 w-4" />
                    Iniciar sesión
                  </Link>
                )}
              </div>
            )}
          </div>

          <Link
            href="/carrito"
            className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ShoppingCart className="h-5 w-5" />
            {mounted && totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-semibold text-white">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Franja de categorías */}
      <div className="hidden border-t border-slate-100 md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2 sm:px-6">
          {DEPARTAMENTOS.map((departamento) => {
            const Icon = DEPARTMENT_ICONS[departamento];
            return (
              <Link
                key={departamento}
                href={`/?categoria=${departamento}`}
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600"
              >
                <Icon className="h-3.5 w-3.5" />
                {departamento}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Menú móvil */}
      {mobileOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
            {role ? (
              <Link href="/perfil" className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Mi cuenta
              </Link>
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
