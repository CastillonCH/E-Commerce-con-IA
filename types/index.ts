/**
 * Tipos compartidos del frontend. Deben reflejar exactamente los esquemas
 * (Pydantic) que expondrá el backend en FastAPI para evitar desincronización
 * entre contratos.
 */

export type UserRole = "ADMIN" | "SELLER" | "CLIENT";

export interface User {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
}

/** Departamentos soportados por el catálogo. Debe reflejar el enum del backend. */
export const DEPARTAMENTOS = [
  "Electronica",
  "Hogar",
  "Moda",
  "Deportes",
  "Belleza",
  "Juguetes",
  "Supermercado",
] as const;

export type Departamento = (typeof DEPARTAMENTOS)[number];

export interface Product {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: Departamento;
  imagen_url: string;
  /** Categoría asignada automáticamente por el modelo de IA (Transfer Learning). */
  categoria_ia: string;
  /** Precio de lista antes del descuento. Si está presente y es mayor a `precio`, se muestra tachado + badge de %. */
  precioOriginal?: number;
  /** Promedio de 0 a 5. Opcional: un producto recién clasificado por la IA aún no tiene reseñas. */
  rating?: number;
  numResenas?: number;
  envioGratis?: boolean;
  esNuevo?: boolean;
}

/** Respuesta del motor de IA al clasificar la imagen de un producto nuevo. */
export interface AIResponse {
  success: boolean;
  predicted_category: string;
  accuracy: number;
}

/** Payload que se envía a POST /api/productos (multipart/form-data). */
export interface NewProductInput {
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: Departamento;
  imagen: File;
}

/** Respuesta esperada al crear un producto: el producto guardado + el veredicto de la IA. */
export interface CreateProductResponse {
  producto: Product;
  ai: AIResponse;
}

export interface CartItem {
  product: Product;
  cantidad: number;
}

/** Forma estándar de error que devuelve FastAPI (HTTPException). */
export interface ApiErrorResponse {
  detail: string;
}
