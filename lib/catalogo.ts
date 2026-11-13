import type { ProductStatus } from "@/types";

// Reglas del catálogo que comparten el panel (cliente) y las Server Actions.
//
// Ciclo de vida de un producto en NovaStore (e-commerce: todo lo vende
// NovaStore y lo carga su propio personal):
//
//   alta ─▶ IA clasifica ─▶ ¿confianza ≥ umbral? ─sí─▶ publicado
//                              │ no
//                              ▼
//                     pendiente_revision ─aprobar─▶ publicado
//                              │ rechazar (motivo)
//                              ▼
//                          rechazado ─corregir y guardar─▶ pendiente_revision
//
//   publicado ⇄ pausado          (sin stock, temporada, error en la ficha)
//   cualquiera ─▶ archivado ─restaurar─▶ pausado (o a revisión si no tenía categoría)

export const ESTADOS_PRODUCTO: { estado: ProductStatus; etiqueta: string }[] = [
  { estado: "publicado", etiqueta: "Publicados" },
  { estado: "pendiente_revision", etiqueta: "En revisión" },
  { estado: "rechazado", etiqueta: "Rechazados" },
  { estado: "pausado", etiqueta: "Pausados" },
  { estado: "archivado", etiqueta: "Archivados" },
];

export const ETIQUETA_ESTADO: Record<ProductStatus, string> = {
  publicado: "Publicado",
  pendiente_revision: "En revisión",
  rechazado: "Rechazado",
  pausado: "Pausado",
  archivado: "Archivado",
};

export function esEstadoProducto(valor: unknown): valor is ProductStatus {
  return typeof valor === "string" && valor in ETIQUETA_ESTADO;
}

// Motivos de rechazo frecuentes: quien revisa elige uno (o escribe otro)
// para que el personal de catálogo sepa qué corregir antes de reenviarlo.
export const MOTIVOS_RECHAZO = [
  "La foto no corresponde al producto",
  "Foto de baja calidad o con marca de agua",
  "Nombre o descripción incompletos",
  "Departamento equivocado",
  "Producto duplicado",
  "Precio incorrecto",
] as const;
