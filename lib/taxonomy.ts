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

// La IA clasifica entre las 21 categorías sin conocer el departamento;
// este es el departamento al que pertenece cada una.
export function departamentoDeCategoria(categoria: string): Departamento | null {
  return DEPARTAMENTOS.find((d) => CATEGORIAS_IA[d].includes(categoria)) ?? null;
}

// Mismo criterio que la columna `slug` de departamentos/categorias en la
// base ("Audio y audífonos" → "audio-y-audifonos"): sin tildes, minúsculas
// y guiones. Las URLs del catálogo se arman con esto, no con el nombre.
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function departamentoFromSlug(slug: string): Departamento | null {
  return DEPARTAMENTOS.find((d) => slugify(d) === slug) ?? null;
}

export function categoriaFromSlug(
  departamento: Departamento,
  slug: string,
): string | null {
  return CATEGORIAS_IA[departamento].find((c) => slugify(c) === slug) ?? null;
}

export function catalogoHref(departamento: string, categoria?: string): string {
  const base = `/categoria/${slugify(departamento)}`;
  return categoria ? `${base}/${slugify(categoria)}` : base;
}
