"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PackagePlus, Package, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/config";
import type { Session } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/admin/vendedores", label: "Vendedores", icon: Users, adminOnly: true },
  { href: "/admin/productos/nuevo", label: "Nuevo producto", icon: PackagePlus, adminOnly: false },
  { href: "/admin/productos", label: "Productos", icon: Package, adminOnly: false },
];

export function AdminSidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || session.role === "ADMIN");

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-lg font-bold text-slate-900">{APP_CONFIG.storeName}</p>
        <p className="text-xs text-slate-500">
          {session.role === "ADMIN" ? "Panel de administrador" : "Panel de vendedor"}
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {session.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{session.name}</p>
            <p className="truncate text-xs text-slate-500">{session.email}</p>
          </div>
        </div>
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
  );
}
