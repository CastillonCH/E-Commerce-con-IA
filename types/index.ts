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
  /** Descripción larga para la página de detalle del producto. */
  descripcion?: string;
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

/** Dirección de envío. Simplificada para Perú (sin dividir en departamento/provincia/distrito todavía). */
export interface ShippingAddress {
  nombre: string;
  direccion: string;
  ciudad: string;
  telefono: string;
}

export type OrderStatus = "pendiente" | "en_camino" | "entregado" | "cancelado";

export type PaymentMethod = "tarjeta" | "yape_plin" | "contraentrega";

export interface OrderItem {
  productId: string;
  nombre: string;
  imagen_url: string;
  precio: number;
  cantidad: number;
}

/**
 * Pedido. Hoy se genera y persiste solo en el navegador (ver
 * store/orders-store.ts); cuando exista `POST /api/pedidos` en el backend,
 * esta es la forma exacta que debe devolver.
 */
export interface Order {
  id: string;
  fecha: string;
  clienteNombre: string;
  clienteEmail: string;
  direccion: ShippingAddress;
  metodoPago: PaymentMethod;
  items: OrderItem[];
  total: number;
  estado: OrderStatus;
}

/** Forma estándar de error que devuelve FastAPI (HTTPException). */
export interface ApiErrorResponse {
  detail: string;
}
