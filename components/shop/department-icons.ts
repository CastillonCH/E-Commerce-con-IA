import {
  Smartphone,
  Sofa,
  Shirt,
  Dumbbell,
  Sparkles,
  Blocks,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import type { Departamento } from "@/lib/taxonomy";

export const DEPARTMENT_ICONS: Record<Departamento, LucideIcon> = {
  Electrónica: Smartphone,
  Hogar: Sofa,
  Moda: Shirt,
  Deportes: Dumbbell,
  Belleza: Sparkles,
  Juguetes: Blocks,
  Supermercado: ShoppingBasket,
};
