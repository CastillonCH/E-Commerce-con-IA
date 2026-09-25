export type UserRole = "ADMIN" | "SELLER" | "CLIENT";

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

export interface Product {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: Departamento;
  imagen_url: string;
  categoria_ia: string;
  precioOriginal?: number;
  rating?: number;
  numResenas?: number;
  envioGratis?: boolean;
  esNuevo?: boolean;
  descripcion?: string;
}

export interface AIResponse {
  success: boolean;
  predicted_category: string;
  accuracy: number;
}

export interface NewProductInput {
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: Departamento;
  imagen: File;
}

export interface CreateProductResponse {
  producto: Product;
  ai: AIResponse;
}

export interface CartItem {
  product: Product;
  cantidad: number;
}

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

export interface ApiErrorResponse {
  detail: string;
}
