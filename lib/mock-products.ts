import type { Product } from "@/types";

/**
 * Datos simulados usados hasta que `GET /api/productos` exista en el backend.
 * `fetchProducts` en lib/api.ts es la única función a reemplazar cuando el
 * endpoint real esté listo; el resto de la UI no necesita cambiar.
 */
export const MOCK_PRODUCTS: Product[] = [
  {
    id: "1",
    nombre: "Audífonos Inalámbricos Pro",
    precio: 89.99,
    stock: 24,
    marca: "SoundMax",
    departamento: "Electronica",
    imagen_url:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "audio_headphones",
  },
  {
    id: "2",
    nombre: "Licuadora de Alta Potencia",
    precio: 54.5,
    stock: 12,
    marca: "HogarPlus",
    departamento: "Hogar",
    imagen_url:
      "https://images.unsplash.com/photo-1570222094114-d054a817e56b?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "kitchen_appliance",
  },
  {
    id: "3",
    nombre: "Chaqueta Impermeable Urbana",
    precio: 129.0,
    stock: 8,
    marca: "UrbanWear",
    departamento: "Moda",
    imagen_url:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "outerwear_jacket",
  },
  {
    id: "4",
    nombre: "Balón de Fútbol Profesional",
    precio: 39.99,
    stock: 40,
    marca: "ProSport",
    departamento: "Deportes",
    imagen_url:
      "https://images.unsplash.com/photo-1614632537197-38a17061c2bd?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "sports_ball",
  },
  {
    id: "5",
    nombre: "Set de Brochas de Maquillaje",
    precio: 24.99,
    stock: 60,
    marca: "GlowBeauty",
    departamento: "Belleza",
    imagen_url:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "beauty_tools",
  },
  {
    id: "6",
    nombre: "Smartwatch Deportivo",
    precio: 149.99,
    stock: 15,
    marca: "SoundMax",
    departamento: "Electronica",
    imagen_url:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "wearable_tech",
  },
  {
    id: "7",
    nombre: "Cafetera Automática",
    precio: 79.9,
    stock: 18,
    marca: "HogarPlus",
    departamento: "Hogar",
    imagen_url:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "kitchen_appliance",
  },
  {
    id: "8",
    nombre: "Tenis Running Ligeros",
    precio: 99.0,
    stock: 30,
    marca: "ProSport",
    departamento: "Deportes",
    imagen_url:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "footwear_sneaker",
  },
];
