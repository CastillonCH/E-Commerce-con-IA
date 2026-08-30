"use client";

import Link from "next/link";
import { Search, ShoppingCart, User } from "lucide-react";
import { DEPARTAMENTOS } from "@/types";
import { APP_CONFIG } from "@/lib/config";
import { useCartStore } from "@/store/cart-store";
import { useHasMounted } from "@/hooks/useHasMounted";

/**
 * Navbar del cliente: logo, búsqueda, categorías, carrito y acceso a perfil.
 * La búsqueda y el selector de categoría solo actualizan la URL (?q=&categoria=);
 * quien lee esos params para filtrar es el Server Component de la página /.
 */
export function Navbar() {
  const totalItems = useCartStore((state) => state.totalItems());
  // El carrito se persiste en localStorage y solo existe en el cliente: se
  // renderiza sin badge en el primer paso (igual que el servidor) y se
  // actualiza tras montar, para evitar un mismatch de hidratación.
  const mounted = useHasMounted();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-xl font-bold tracking-tight text-slate-900"
        >
          {/* ESPACIO PARA LOGO / NOMBRE DE LA TIENDA */}
          {APP_CONFIG.storeName}
        </Link>

        <form
          action="/"
          className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-2 sm:flex-1"
        >
          <div className="flex w-full items-center rounded-lg border border-slate-300 bg-slate-50 px-3 focus-within:border-slate-900 focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder="Buscar productos, marcas y más..."
              className="w-full bg-transparent px-2 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
          <select
            name="categoria"
            defaultValue=""
            className="hidden shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2 py-2.5 text-sm text-slate-700 outline-none md:block"
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {DEPARTAMENTOS.map((departamento) => (
              <option key={departamento} value={departamento}>
                {departamento}
              </option>
            ))}
          </select>
        </form>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
          <Link
            href="/carrito"
            className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden sm:inline">Carrito</span>
            {mounted && totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                {totalItems}
              </span>
            )}
          </Link>
          <Link
            href="/perfil"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Mi Perfil</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
