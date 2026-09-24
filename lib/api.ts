import axios, { AxiosError } from "axios";
import { APP_CONFIG } from "@/lib/config";
import type {
  ApiErrorResponse,
  CreateProductResponse,
  NewProductInput,
  Product,
} from "@/types";

/**
 * Cliente axios único hacia el backend FastAPI. Centralizar la baseURL y el
 * manejo de errores aquí evita repetir try/catch y strings de URL en cada
 * componente, y es el único lugar a tocar cuando cambie el contrato del backend.
 */
export const api = axios.create({
  baseURL: APP_CONFIG.apiUrl,
  timeout: 15000,
});

/** Normaliza cualquier error de axios al mensaje que el backend envía en `detail`. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>;
    return (
      axiosError.response?.data?.detail ??
      "No se pudo conectar con el servidor. Intenta de nuevo."
    );
  }
  return "Ocurrió un error inesperado.";
}

export async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>("/api/productos");
  return data;
}

/**
 * Envía el formulario de "Nuevo producto" como multipart/form-data: el backend
 * recibe la imagen, la pasa por la red neuronal (Transfer Learning) y devuelve
 * el producto guardado junto con la categoría que predijo la IA.
 */
export async function createProduct(
  input: NewProductInput
): Promise<CreateProductResponse> {
  const formData = new FormData();
  formData.append("nombre", input.nombre);
  formData.append("precio", String(input.precio));
  formData.append("stock", String(input.stock));
  formData.append("marca", input.marca);
  formData.append("departamento", input.departamento);
  formData.append("imagen", input.imagen);

  const { data } = await api.post<CreateProductResponse>(
    "/api/productos",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

/** Payload para editar un producto existente. La imagen es opcional: si no se reemplaza, el backend conserva la actual. */
export interface UpdateProductInput {
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: NewProductInput["departamento"];
  imagen?: File;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput
): Promise<Product> {
  const formData = new FormData();
  formData.append("nombre", input.nombre);
  formData.append("precio", String(input.precio));
  formData.append("stock", String(input.stock));
  formData.append("marca", input.marca);
  formData.append("departamento", input.departamento);
  if (input.imagen) formData.append("imagen", input.imagen);

  const { data } = await api.put<Product>(`/api/productos/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/api/productos/${id}`);
}
