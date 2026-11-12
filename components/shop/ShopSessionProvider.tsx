"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Product } from "@/types";
import type { Session } from "@/lib/auth";
import { useCartStore } from "@/store/cart-store";

// Solo un cliente con sesión puede llenar el carrito. Si alguien sin
// sesión pulsa "Añadir al carrito" o "Comprar ahora", NO se agrega nada:
// se recuerda el producto aquí y se le manda al login. Al volver ya con
// sesión, el provider lo agrega (una sola vez) — así no tiene que buscarlo
// de nuevo.
const PENDING_KEY = "novastore-pending-cart";

interface PendingCartItem {
  product: Product;
  cantidad: number;
}

const SessionContext = createContext<Session | null>(null);

export function ShopSessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clear);

  useEffect(() => {
    // El carrito vive en localStorage y no es de nadie: sin sesión (cerró
    // sesión o expiró) se vacía, para que el siguiente que use este
    // navegador no herede los productos del anterior.
    if (!session) {
      clearCart();
      return;
    }
    let pending: PendingCartItem | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      pending = raw ? (JSON.parse(raw) as PendingCartItem) : null;
    } catch {
      pending = null;
    }
    if (pending?.product?.id) {
      addItem(pending.product, Math.max(1, pending.cantidad || 1));
      toast.success(`${pending.product.nombre} añadido al carrito`);
    }
  }, [session, addItem, clearCart]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useShopSession(): Session | null {
  return useContext(SessionContext);
}

/**
 * Agrega al carrito solo si hay sesión. Sin sesión, guarda el producto
 * como pendiente y redirige al login; al volver a esta misma página con
 * sesión, ShopSessionProvider lo agrega.
 */
export function useAddToCart() {
  const session = useShopSession();
  const addItem = useCartStore((state) => state.addItem);
  const router = useRouter();
  const pathname = usePathname();

  return function addToCart(product: Product, cantidad = 1): boolean {
    if (session) {
      addItem(product, cantidad);
      toast.success(`${product.nombre} añadido al carrito`);
      return true;
    }

    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ product, cantidad }));
    } catch {
      // almacenamiento bloqueado: igual se le pide iniciar sesión
    }
    const volverA = `${pathname}${window.location.search}`;
    toast.info("Inicia sesión para añadir productos a tu carrito");
    router.push(`/login?from=${encodeURIComponent(volverA)}`);
    return false;
  };
}
