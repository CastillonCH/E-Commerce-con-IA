import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APP_CONFIG } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    style: "currency",
    currency: APP_CONFIG.currency,
  }).format(amount);
}

export function discountPercent(
  precio: number,
  precioOriginal?: number,
): number | null {
  if (!precioOriginal || precioOriginal <= precio) return null;
  return Math.round(((precioOriginal - precio) / precioOriginal) * 100);
}
