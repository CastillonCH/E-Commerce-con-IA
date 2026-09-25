import axios, { AxiosError } from "axios";
import { APP_CONFIG } from "@/lib/config";
import type {
  ApiErrorResponse,
  CreateProductResponse,
  NewProductInput,
  Product,
} from "@/types";

export const api = axios.create({
  baseURL: APP_CONFIG.apiUrl,
  timeout: 15000,
});

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

export async function createProduct(
  input: NewProductInput,
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
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

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
  input: UpdateProductInput,
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
