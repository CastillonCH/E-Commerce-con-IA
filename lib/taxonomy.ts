export const DEPARTAMENTOS = [
  "Electrónica",
  "Hogar",
  "Moda",
  "Deportes",
  "Belleza",
  "Juguetes",
  "Supermercado",
] as const;

export type Departamento = (typeof DEPARTAMENTOS)[number];

export const CATEGORIAS_IA: Record<Departamento, readonly string[]> = {
  Electrónica: [
    "Audio y audífonos",
    "Laptops y computadoras",
    "Relojes inteligentes y wearables",
  ],
  Hogar: ["Electrodomésticos de cocina", "Muebles", "Decoración y menaje"],
  Moda: ["Casacas y abrigos", "Zapatillas y calzado", "Polos y camisas"],
  Deportes: ["Balones", "Ropa deportiva", "Equipos de fitness"],
  Belleza: ["Fragancias", "Maquillaje", "Herramientas de belleza"],
  Juguetes: ["Bloques de construcción", "Peluches", "Vehículos de juguete"],
  Supermercado: ["Bebidas", "Abarrotes y snacks", "Limpieza del hogar"],
};
