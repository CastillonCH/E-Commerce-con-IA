import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product } from "@/types";

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

/**
 * Estado global del carrito. Persistido en localStorage para que sobreviva
 * a recargas de página sin necesitar backend todavía.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product) =>
        set((state) => {
          const existing = state.items.find(
            (item) => item.product.id === product.id
          );
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, cantidad: item.cantidad + 1 }
                  : item
              ),
            };
          }
          return { items: [...state.items, { product, cantidad: 1 }] };
        }),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        })),
      clear: () => set({ items: [] }),
      totalItems: () =>
        get().items.reduce((sum, item) => sum + item.cantidad, 0),
      totalPrice: () =>
        get().items.reduce(
          (sum, item) => sum + item.product.precio * item.cantidad,
          0
        ),
    }),
    { name: "cart-storage" }
  )
);
