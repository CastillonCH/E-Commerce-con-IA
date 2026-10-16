import axios, { AxiosError } from "axios";
import { APP_CONFIG } from "@/lib/config";
import type { ApiErrorResponse, CreateProductResponse, NewProductInput } from "@/types";

// Único punto que todavía habla con un servicio externo: subir la imagen de
// un producto nuevo y clasificarla con IA. El resto de la app (catálogo,
// pedidos, usuarios, editar/eliminar un producto) ya vive en PostgreSQL vía
// lib/db.ts y lib/data/*-repo.ts.
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
