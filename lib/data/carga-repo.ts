import "server-only";
import { query } from "@/lib/db";

// Tiempo que tarda el personal en cargar una ficha, manual vs asistido por
// la IA (db/migraciones/004_carga_asistida.sql → fn_metricas_carga).
export type ModoCarga = "manual" | "asistido";

export interface MetricaCarga {
  modo: ModoCarga;
  fichas: number;
  segPromedio: number | null;
  segMediana: number | null;
  conCategoriaFinal: number;
  malCategorizadas: number;
  pctError: number | null;
  pctSugerenciasAceptadas: number | null;
}

interface MetricaRow {
  modo: ModoCarga;
  fichas: number;
  seg_promedio: string | null;
  seg_mediana: string | null;
  con_categoria_final: number;
  mal_categorizadas: number;
  pct_error: string | null;
  pct_sugerencias_aceptadas: string | null;
}

const numero = (valor: string | null): number | null => (valor === null ? null : Number(valor));

function toMetrica(row: MetricaRow): MetricaCarga {
  return {
    modo: row.modo,
    fichas: Number(row.fichas),
    segPromedio: numero(row.seg_promedio),
    segMediana: numero(row.seg_mediana),
    conCategoriaFinal: Number(row.con_categoria_final),
    malCategorizadas: Number(row.mal_categorizadas),
    pctError: numero(row.pct_error),
    pctSugerenciasAceptadas: numero(row.pct_sugerencias_aceptadas),
  };
}

export type ResumenCarga = Partial<Record<ModoCarga, MetricaCarga>>;

/** De todo el personal, o de una persona si se pasa su email. */
export async function obtenerMetricasCarga(email?: string): Promise<ResumenCarga> {
  const rows = await query<MetricaRow>(
    `SELECT * FROM fn_metricas_carga(
       CASE WHEN $1::text IS NULL THEN NULL
            ELSE (SELECT id FROM usuarios WHERE email = $1::citext) END)`,
    [email ?? null],
  );
  return Object.fromEntries(rows.map((row) => [row.modo, toMetrica(row)]));
}

export interface MetricaCargaPersona extends ResumenCarga {
  nombre: string;
  email: string;
}

/** Una fila por persona del personal que ya cargó al menos una ficha medida. */
export async function obtenerMetricasCargaPorPersona(): Promise<MetricaCargaPersona[]> {
  const rows = await query<MetricaRow & { nombre: string; email: string }>(
    `SELECT u.nombre, u.email::text AS email, m.*
       FROM usuarios u
       CROSS JOIN LATERAL fn_metricas_carga(u.id) m
      WHERE u.rol IN ('ADMIN', 'CATALOGO')
      ORDER BY u.nombre, m.modo`,
  );
  const porPersona = new Map<string, MetricaCargaPersona>();
  for (const row of rows) {
    const persona = porPersona.get(row.email) ?? { nombre: row.nombre, email: row.email };
    persona[row.modo] = toMetrica(row);
    porPersona.set(row.email, persona);
  }
  return [...porPersona.values()];
}

/** Cuánto menos tarda una ficha con la IA (mediana), en %. null si falta un modo. */
export function ahorroPorcentual(resumen: ResumenCarga): number | null {
  const manual = resumen.manual?.segMediana;
  const asistido = resumen.asistido?.segMediana;
  if (!manual || asistido === null || asistido === undefined) return null;
  return Math.round((1 - asistido / manual) * 100);
}

// --- Proceso completo (carga + revisión) por modo — migración 006 ---------
export interface MetricaProceso {
  modo: ModoCarga;
  fichas: number;
  segCargaMediana: number | null;
  pctARevision: number | null;
  revisadas: number;
  segRevisionMediana: number | null;
  segProcesoMediana: number | null;
  pctCorrecciones: number | null;
  conReferencia: number;
  pctErrorCarga: number | null;
  pctErrorIA: number | null;
  pctErrorPublicado: number | null;
}

interface ProcesoRow {
  modo: ModoCarga;
  fichas: number;
  seg_carga_mediana: string | null;
  pct_a_revision: string | null;
  revisadas: number;
  seg_revision_mediana: string | null;
  seg_proceso_mediana: string | null;
  pct_correcciones: string | null;
  con_referencia: number;
  pct_error_carga: string | null;
  pct_error_ia: string | null;
  pct_error_publicado: string | null;
}

export type ResumenProceso = Partial<Record<ModoCarga, MetricaProceso>>;

/** soloExperimento: solo las fichas de la lista del experimento (con referencia). */
export async function obtenerMetricasProceso(soloExperimento: boolean): Promise<ResumenProceso> {
  const rows = await query<ProcesoRow>(`SELECT * FROM fn_metricas_proceso($1)`, [soloExperimento]);
  return Object.fromEntries(
    rows.map((row) => [
      row.modo,
      {
        modo: row.modo,
        fichas: Number(row.fichas),
        segCargaMediana: numero(row.seg_carga_mediana),
        pctARevision: numero(row.pct_a_revision),
        revisadas: Number(row.revisadas),
        segRevisionMediana: numero(row.seg_revision_mediana),
        segProcesoMediana: numero(row.seg_proceso_mediana),
        pctCorrecciones: numero(row.pct_correcciones),
        conReferencia: Number(row.con_referencia),
        pctErrorCarga: numero(row.pct_error_carga),
        pctErrorIA: numero(row.pct_error_ia),
        pctErrorPublicado: numero(row.pct_error_publicado),
      },
    ]),
  );
}

export interface AvanceExperimento {
  grupo: "A" | "B";
  total: number;
  cargadas: number;
}

/** Cuántas fichas de cada grupo del experimento ya se cargaron. */
export async function obtenerAvanceExperimento(): Promise<AvanceExperimento[]> {
  const rows = await query<{ grupo: "A" | "B"; total: number; cargadas: number }>(
    `SELECT grupo, count(*)::int AS total, count(producto_id)::int AS cargadas
       FROM experimento_fichas GROUP BY grupo ORDER BY grupo`,
  );
  return rows.map((row) => ({ grupo: row.grupo, total: Number(row.total), cargadas: Number(row.cargadas) }));
}

export function formatearDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return "—";
  if (segundos < 60) return `${Math.round(segundos)} s`;
  const minutos = Math.floor(segundos / 60);
  const resto = Math.round(segundos % 60);
  return resto ? `${minutos} min ${resto} s` : `${minutos} min`;
}
