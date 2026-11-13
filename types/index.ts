import type { Departamento } from "@/lib/taxonomy";

// ADMIN: todo el panel. CATALOGO: personal que carga y mantiene productos.
// CLIENT: comprador. NovaStore es un e-commerce: no hay vendedores externos.
export type UserRole = "ADMIN" | "CATALOGO" | "CLIENT";

export type { Departamento };

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

export interface AITopK {
  categoria: string;
  prob: number;
}

// Resultado fusionado (imagen+texto) que devuelve ai-service — ver
// ai-service/app/esquemas.py::ResultadoClasificacion. `confidence` en vez
// de `accuracy`: accuracy es una métrica del MODELO (qué tan bien
// clasifica en general, medida en el conjunto de prueba), confidence es
// la probabilidad de ESTA predicción puntual — nunca fueron lo mismo.
export interface AIResultado {
  categoria: string;
  confidence: number;
  topK: AITopK[];
  modo: "real" | "demo";
}

export interface NewProductInput {
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: Departamento;
  categoriaManual: string;
  proveedorId?: string;
  imagen: File;
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

// Estados de un producto en el panel (enum estado_publicacion de la base).
export type ProductStatus =
  | "pendiente_revision"
  | "publicado"
  | "rechazado"
  | "pausado"
  | "archivado";

// Empresa a la que NovaStore le compra la mercadería. Solo datos: no
// inicia sesión ni publica productos.
export interface Proveedor {
  id: string;
  nombre: string;
  razonSocial: string | null;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  productos: number;
}
