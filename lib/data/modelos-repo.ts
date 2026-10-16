import "server-only";
import { query, queryOne } from "@/lib/db";

export interface ModeloIA {
  codigo: string;
  casoUso: string;
  tipo: string;
  arquitectura: string;
  version: string;
  estado: string;
  metricas: Record<string, number>;
  entrenadoEn: string | null;
}

interface ModeloRow {
  codigo: string;
  caso_uso: string;
  tipo: string;
  arquitectura: string;
  version: string;
  estado: string;
  metricas: Record<string, number>;
  entrenado_en: Date | null;
}

export async function listModelosIA(): Promise<ModeloIA[]> {
  const rows = await query<ModeloRow>(
    `SELECT codigo, caso_uso, tipo, arquitectura, version, estado, metricas, entrenado_en
       FROM modelos_ia ORDER BY caso_uso, codigo`,
  );
  return rows.map((row) => ({
    codigo: row.codigo,
    casoUso: row.caso_uso,
    tipo: row.tipo,
    arquitectura: row.arquitectura,
    version: row.version,
    estado: row.estado,
    metricas: row.metricas ?? {},
    entrenadoEn: row.entrenado_en ? row.entrenado_en.toISOString() : null,
  }));
}

// Metas del T1 (Tabla 10) para comparar "cumple / no cumple" en /admin/modelos.
export const METAS_T1: Record<string, { etiqueta: string; cumple: (m: Record<string, number>) => boolean }> = {
  "cu1-resnet50-v1": {
    etiqueta: "OE1: accuracy ≥ 80% y F1-macro ≥ 0,75",
    cumple: (m) => (m.accuracy ?? 0) >= 0.8 && (m.f1_macro ?? 0) >= 0.75,
  },
  "cu1-efficientnet-b0-v1": {
    etiqueta: "OE1: accuracy ≥ 80% y F1-macro ≥ 0,75",
    cumple: (m) => (m.accuracy ?? 0) >= 0.8 && (m.f1_macro ?? 0) >= 0.75,
  },
  "cu2-beto-v1": {
    etiqueta: "OE2: F1-macro ≥ 0,85",
    cumple: (m) => (m.f1_macro ?? 0) >= 0.85,
  },
  "cu2-tfidf-logreg-v1": {
    etiqueta: "Baseline de referencia para OE2 (no tiene meta propia)",
    cumple: () => true,
  },
};

export interface MetricasClasificacion {
  modelo: string;
  casoUso: string;
  fichasRevisadas: number;
  aceptadas: number;
  corregidas: number;
  pctAcierto: number | null;
  pctCorregidas: number | null;
  minutosPromedioRevision: number | null;
  confianzaPromedio: number | null;
}

export async function obtenerMetricasClasificacion(): Promise<MetricasClasificacion[]> {
  const rows = await query<{
    modelo: string;
    caso_uso: string;
    fichas_revisadas: number;
    aceptadas: number;
    corregidas: number;
    pct_acierto: number | null;
    pct_corregidas: number | null;
    minutos_promedio_revision: number | null;
    confianza_promedio: number | null;
  }>(`SELECT * FROM v_metricas_clasificacion ORDER BY caso_uso, modelo`);
  return rows.map((r) => ({
    modelo: r.modelo,
    casoUso: r.caso_uso,
    fichasRevisadas: Number(r.fichas_revisadas),
    aceptadas: Number(r.aceptadas),
    corregidas: Number(r.corregidas),
    pctAcierto: r.pct_acierto,
    pctCorregidas: r.pct_corregidas,
    minutosPromedioRevision: r.minutos_promedio_revision,
    confianzaPromedio: r.confianza_promedio,
  }));
}

export interface LineaBaseCategorizacion {
  productosConCategoriaFinal: number;
  conCategoriaDelVendedor: number;
  malCategorizadosPorVendedor: number;
  pctErrorVendedor: number | null;
}

export async function obtenerLineaBase(): Promise<LineaBaseCategorizacion> {
  const row = await queryOne<{
    productos_con_categoria_final: number;
    con_categoria_del_vendedor: number;
    mal_categorizados_por_vendedor: number;
    pct_error_vendedor: number | null;
  }>(`SELECT * FROM v_linea_base_categorizacion`);
  return {
    productosConCategoriaFinal: Number(row?.productos_con_categoria_final ?? 0),
    conCategoriaDelVendedor: Number(row?.con_categoria_del_vendedor ?? 0),
    malCategorizadosPorVendedor: Number(row?.mal_categorizados_por_vendedor ?? 0),
    pctErrorVendedor: row?.pct_error_vendedor ?? null,
  };
}

export interface MetricasDuplicados {
  verdaderosPositivos: number;
  falsosPositivos: number;
  pendientes: number;
  precisionPct: number | null;
}

export async function obtenerMetricasDuplicados(): Promise<MetricasDuplicados> {
  const row = await queryOne<{
    verdaderos_positivos: number;
    falsos_positivos: number;
    pendientes: number;
    precision_pct: number | null;
  }>(`SELECT * FROM v_metricas_duplicados`);
  return {
    verdaderosPositivos: Number(row?.verdaderos_positivos ?? 0),
    falsosPositivos: Number(row?.falsos_positivos ?? 0),
    pendientes: Number(row?.pendientes ?? 0),
    precisionPct: row?.precision_pct ?? null,
  };
}
