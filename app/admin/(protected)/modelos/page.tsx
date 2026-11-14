import { redirect } from "next/navigation";
import { Download, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { obtenerSaludIA } from "@/lib/ai-client";
import {
  listModelosIA,
  obtenerLineaBase,
  obtenerMetricasClasificacion,
  obtenerMetricasDuplicados,
} from "@/lib/data/modelos-repo";
import {
  ahorroPorcentual,
  formatearDuracion,
  obtenerAvanceExperimento,
  obtenerMetricasCarga,
  obtenerMetricasCargaPorPersona,
  obtenerMetricasProceso,
  type MetricaProceso,
  type ResumenProceso,
} from "@/lib/data/carga-repo";
import { getServerEnv } from "@/lib/env.server";
import { cn } from "@/lib/utils";
import { METAS_T1, NOMBRE_CONJUNTO, SIN_META, metricasDe, type MetricasConjunto } from "@/lib/metas-t1";

export default async function AdminModelosPage() {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/admin/dashboard");

  const [salud, modelos, metricasClasificacion, lineaBase, metricasDuplicados, carga, cargaPorPersona, avance] =
    await Promise.all([
      obtenerSaludIA(),
      listModelosIA(),
      obtenerMetricasClasificacion(),
      obtenerLineaBase(),
      obtenerMetricasDuplicados(),
      obtenerMetricasCarga(),
      obtenerMetricasCargaPorPersona(),
      obtenerAvanceExperimento(),
    ]);
  // Si ya hay fichas del experimento cargadas, se mide solo sobre ellas
  // (tienen categoría de referencia); si no, sobre todas las medidas.
  const hayExperimento = avance.some((grupo) => grupo.cargadas > 0);
  const proceso = await obtenerMetricasProceso(hayExperimento);
  const ahorro = ahorroPorcentual(carga);
  const metricasPorConjunto = {
    val: Object.fromEntries(modelos.map((m) => [m.codigo, metricasDe(m.metricas, "val")])),
    test: Object.fromEntries(modelos.map((m) => [m.codigo, metricasDe(m.metricas, "test")])),
  } satisfies Record<"val" | "test", Record<string, MetricasConjunto>>;
  const nPrueba = modelos.map((m) => m.metricas.n_test).find((n) => typeof n === "number");
  const modoCatalogo = getServerEnv().MODO_CATALOGO;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Modelos de IA</h1>
          <p className="mt-1 text-sm text-slate-500">
            Estado del servicio, métricas de cada modelo contra las metas del
            T1, y el dataset para reentrenar.
          </p>
        </div>
        <a
          href="/api/admin/dataset-entrenamiento"
          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
        >
          <Download className="h-4 w-4" />
          Exportar dataset para reentrenar
        </a>
      </div>

      {/* Estado del servicio */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-4",
          !salud && "border-red-200 bg-red-50",
          salud?.modo === "demo" && "border-amber-200 bg-amber-50",
          salud?.modo === "real" && "border-emerald-200 bg-emerald-50",
        )}
      >
        {!salud ? (
          <XCircle className="h-5 w-5 shrink-0 text-red-600" />
        ) : salud.modo === "demo" ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {!salud
              ? "El servicio de IA no responde"
              : salud.modo === "demo"
                ? "El servicio de IA está en modo demostración"
                : "El servicio de IA está activo con modelos reales"}
          </p>
          <p className="text-sm text-slate-600">
            {!salud
              ? "Revisa AI_SERVICE_URL en .env.local y que ai-service esté corriendo (ver ai-service/README.md)."
              : salud.modo === "demo"
                ? "No hay ningún modelo entrenado cargado todavía — las sugerencias se generan con reglas de palabras clave, no son predicciones reales."
                : `Modelos cargados: ${salud.modelosCargados.join(", ")}`}
          </p>
        </div>
      </div>

      {/* Tabla de modelos vs. metas del T1: validación y prueba por separado */}
      <section aria-labelledby="titulo-modelos">
        <h2 id="titulo-modelos" className="mb-1 text-lg font-semibold text-slate-900">
          Modelos registrados
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          <strong>Validación</strong>: datos con los que se eligió la mejor época y el peso de la fusión.{" "}
          <strong>Prueba</strong>: {nPrueba ? `${nPrueba} productos` : "productos"} que ningún modelo vio al
          entrenar; es la medida que vale para las metas. La tienda usa la fusión de los modelos en producción.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="sr-only">Modelos de IA frente a las metas del T1</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">Modelo</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium">{NOMBRE_CONJUNTO.val}</th>
                <th scope="col" className="px-4 py-3 font-medium">{NOMBRE_CONJUNTO.test}</th>
                <th scope="col" className="px-4 py-3 font-medium">Meta del T1</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((modelo) => {
                const meta = METAS_T1[modelo.codigo];
                return (
                  <tr key={modelo.codigo} className="border-b border-slate-100 text-slate-700 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm text-slate-900">{modelo.codigo}</p>
                      <p className="text-xs text-slate-500">{modelo.arquitectura}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
                          modelo.estado === "en_produccion" && "bg-emerald-100 text-emerald-700",
                          modelo.estado === "evaluado" && "bg-sky-100 text-sky-700",
                          modelo.estado === "planificado" && "bg-slate-100 text-slate-600",
                        )}
                      >
                        {ETIQUETA_ESTADO[modelo.estado] ?? modelo.estado}
                      </span>
                    </td>
                    {(["val", "test"] as const).map((conjunto) => {
                      const m = metricasPorConjunto[conjunto][modelo.codigo];
                      const cumple = meta ? meta.cumple(m, metricasPorConjunto[conjunto]) : null;
                      return (
                        <td key={conjunto} className="px-4 py-3" data-testid={`${conjunto}-${modelo.codigo}`}>
                          {m.accuracy === null && m.f1 === null ? (
                            <span className="text-slate-500">Sin dato</span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              {cumple === true && <CheckCircle2 aria-label="Cumple la meta" className="h-4 w-4 shrink-0 text-emerald-600" />}
                              {cumple === false && <XCircle aria-label="No cumple la meta" className="h-4 w-4 shrink-0 text-red-600" />}
                              <span>
                                {m.accuracy !== null && <>acc {formatearPct(m.accuracy)}</>}
                                {m.accuracy !== null && m.f1 !== null && " · "}
                                {m.f1 !== null && <>F1 {m.f1.toFixed(3).replace(".", ",")}</>}
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-slate-600">{meta?.etiqueta ?? SIN_META[modelo.codigo] ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Proceso completo: carga + revisión, contra la referencia */}
      <section aria-labelledby="titulo-proceso">
        <h2 id="titulo-proceso" className="mb-1 text-lg font-semibold text-slate-900">
          Proceso completo: sin IA vs con IA
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Carga + revisión de cada ficha. Las cargadas sin IA siempre pasan por revisión; con IA, solo las dudosas.
          El error se mide contra la categoría correcta conocida de la lista del experimento, que nadie ve.
          No cuenta las fichas con la IA caída ni las que revisó quien las cargó.
        </p>
        {avance.length > 0 ? (
          <p className="mb-3 text-sm text-slate-600" data-testid="avance-experimento">
            Experimento: {avance.map((g) => `grupo ${g.grupo} ${g.cargadas} de ${g.total}`).join(" · ")} fichas cargadas
            {!hayExperimento && " — mientras no haya ninguna, se muestran todas las fichas medidas (sin referencia)"}.
          </p>
        ) : (
          <p className="mb-3 text-sm text-slate-600" data-testid="avance-experimento">
            Todavía no se cargó la lista del experimento (ver ml/experimento/preparar_experimento.py): sin ella no
            hay categoría de referencia y no se puede medir el error.
          </p>
        )}
        {!proceso.manual && !proceso.asistido ? (
          <EstadoVacio mensaje="Todavía no hay fichas medidas." />
        ) : (
          <TablaProceso proceso={proceso} />
        )}
      </section>

      {/* Tiempo de carga del personal: manual vs con la IA */}
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Tiempo de carga por ficha: sin IA vs con IA
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Desde que empieza a llenar el formulario hasta que guarda. El modo de cada empleado
          (con IA o sin IA) se elige en{" "}
          <a href="/admin/personal" className="font-medium text-slate-900 underline">Personal</a>; quien no
          tenga uno elegido carga{" "}
          <strong>{modoCatalogo === "asistido" ? "con IA" : "sin IA"}</strong> (valor por defecto).
        </p>
        {!carga.manual && !carga.asistido ? (
          <EstadoVacio mensaje="Todavía no hay fichas cargadas con la medición de tiempo." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tarjeta
                etiqueta={`Sin IA (${carga.manual?.fichas ?? 0} fichas)`}
                valor={formatearDuracion(carga.manual?.segMediana)}
              />
              <Tarjeta
                etiqueta={`Con IA (${carga.asistido?.fichas ?? 0} fichas)`}
                valor={formatearDuracion(carga.asistido?.segMediana)}
              />
              <Tarjeta
                etiqueta="Ahorro de tiempo"
                valor={ahorro !== null ? `${ahorro}%` : "—"}
                resaltado={ahorro !== null && ahorro > 0}
              />
              <Tarjeta
                etiqueta="Sugerencias aceptadas"
                valor={
                  carga.asistido?.pctSugerenciasAceptadas !== null && carga.asistido?.pctSugerenciasAceptadas !== undefined
                    ? `${carga.asistido.pctSugerenciasAceptadas}%`
                    : "—"
                }
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tiempos en mediana (no los distorsiona una ficha que quedó abierta mucho rato).
              % de error de categoría: sin IA {carga.manual?.pctError ?? "—"}% · con IA {carga.asistido?.pctError ?? "—"}%
              {" "}(sobre fichas con categoría final confirmada).
            </p>
            {cargaPorPersona.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">Tiempo de carga por persona</caption>
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th scope="col" className="px-4 py-3 font-medium">Persona</th>
                      <th scope="col" className="px-4 py-3 font-medium">Fichas</th>
                      <th scope="col" className="px-4 py-3 font-medium">Sin IA</th>
                      <th scope="col" className="px-4 py-3 font-medium">Con IA</th>
                      <th scope="col" className="px-4 py-3 font-medium">Sugerencias aceptadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargaPorPersona.map((persona) => (
                      <tr key={persona.email} className="border-b border-slate-100 text-slate-700 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{persona.nombre}</p>
                          <p className="text-xs text-slate-500">{persona.email}</p>
                        </td>
                        <td className="px-4 py-3">{(persona.manual?.fichas ?? 0) + (persona.asistido?.fichas ?? 0)}</td>
                        <td className="px-4 py-3">{formatearDuracion(persona.manual?.segMediana)}</td>
                        <td className="px-4 py-3">{formatearDuracion(persona.asistido?.segMediana)}</td>
                        <td className="px-4 py-3">
                          {persona.asistido?.pctSugerenciasAceptadas !== null && persona.asistido?.pctSugerenciasAceptadas !== undefined
                            ? `${persona.asistido.pctSugerenciasAceptadas}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Línea base del problema (T1 1.2.1) */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Línea base: categorización manual (sin IA)
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          No cuenta las fichas cargadas con la sugerencia a la vista: la línea base solo vale si se eligió a ciegas.
          Compara contra la categoría final que quedó publicada; la medición contra una referencia independiente
          está en &ldquo;Proceso completo&rdquo;.
        </p>
        {lineaBase.conCategoriaManual === 0 ? (
          <EstadoVacio mensaje="Todavía no hay productos con categoría elegida a mano para medir esto." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta etiqueta="Con categoría elegida a mano" valor={lineaBase.conCategoriaManual} />
            <Tarjeta etiqueta="Mal categorizados" valor={lineaBase.malCategorizadosManual} />
            <Tarjeta
              etiqueta="% de error manual"
              valor={lineaBase.pctErrorManual !== null ? `${lineaBase.pctErrorManual}%` : "—"}
            />
            <Tarjeta etiqueta="Meta del objetivo general" valor="≤ 5%" />
          </div>
        )}
      </div>

      {/* Métricas de clasificación por modelo (revisiones) */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Revisión humana por modelo
        </h2>
        {metricasClasificacion.every((m) => m.fichasRevisadas === 0) ? (
          <EstadoVacio mensaje="Todavía no se revisó ninguna ficha desde /admin/revision." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="px-4 py-3 font-medium">Modelo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fichas revisadas</th>
                  <th scope="col" className="px-4 py-3 font-medium">% aceptadas</th>
                  <th scope="col" className="px-4 py-3 font-medium">Minutos promedio</th>
                </tr>
              </thead>
              <tbody>
                {metricasClasificacion
                  .filter((m) => m.fichasRevisadas > 0)
                  .map((m) => (
                    <tr key={m.modelo} className="border-b border-slate-100 text-slate-700 last:border-0">
                      <td className="px-4 py-3 font-mono text-sm">{m.modelo}</td>
                      <td className="px-4 py-3">{m.fichasRevisadas}</td>
                      <td className="px-4 py-3">{m.pctAcierto ?? "—"}%</td>
                      <td className="px-4 py-3">{m.minutosPromedioRevision ?? "—"} min</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CU5 duplicados */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          CU5 — Precisión de duplicados (meta OE3: ≥ 90%)
        </h2>
        {metricasDuplicados.verdaderosPositivos + metricasDuplicados.falsosPositivos === 0 ? (
          <EstadoVacio mensaje="Todavía no se confirmó ni descartó ningún par en /admin/duplicados." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta etiqueta="Confirmados" valor={metricasDuplicados.verdaderosPositivos} />
            <Tarjeta etiqueta="Descartados" valor={metricasDuplicados.falsosPositivos} />
            <Tarjeta etiqueta="Pendientes" valor={metricasDuplicados.pendientes} />
            <Tarjeta
              etiqueta="Precisión"
              valor={metricasDuplicados.precisionPct !== null ? `${metricasDuplicados.precisionPct}%` : "—"}
              resaltado={metricasDuplicados.precisionPct !== null && metricasDuplicados.precisionPct >= 90}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const pct = (valor: number | null | undefined) => (valor === null || valor === undefined ? "—" : `${valor}%`);

const FILAS_PROCESO: { etiqueta: string; valor: (m: MetricaProceso | undefined) => string }[] = [
  { etiqueta: "Fichas medidas", valor: (m) => String(m?.fichas ?? 0) },
  { etiqueta: "Tiempo de carga (mediana)", valor: (m) => formatearDuracion(m?.segCargaMediana) },
  { etiqueta: "Fichas que pasaron por revisión", valor: (m) => pct(m?.pctARevision) },
  { etiqueta: "Tiempo de revisión por ficha revisada (mediana)", valor: (m) => formatearDuracion(m?.segRevisionMediana) },
  { etiqueta: "Tiempo total del proceso por ficha (mediana)", valor: (m) => formatearDuracion(m?.segProcesoMediana) },
  { etiqueta: "Revisiones que corrigieron la categoría", valor: (m) => pct(m?.pctCorrecciones) },
  { etiqueta: "Fichas con categoría de referencia", valor: (m) => String(m?.conReferencia ?? 0) },
  { etiqueta: "Error al cargar (lo que eligió la persona)", valor: (m) => pct(m?.pctErrorCarga) },
  { etiqueta: "Error de la IA sola en esas fichas", valor: (m) => pct(m?.pctErrorIA) },
  { etiqueta: "Error publicado (después de la revisión)", valor: (m) => pct(m?.pctErrorPublicado) },
];

function TablaProceso({ proceso }: { proceso: ResumenProceso }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Proceso completo de catalogación, sin IA y con IA</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="px-4 py-3 font-medium">Métrica</th>
            <th scope="col" className="px-4 py-3 font-medium">Sin IA</th>
            <th scope="col" className="px-4 py-3 font-medium">Con IA</th>
          </tr>
        </thead>
        <tbody>
          {FILAS_PROCESO.map((fila) => (
            <tr key={fila.etiqueta} className="border-b border-slate-100 text-slate-700 last:border-0">
              <th scope="row" className="px-4 py-2.5 font-normal text-slate-600">{fila.etiqueta}</th>
              <td className="px-4 py-2.5 font-semibold text-slate-900">{fila.valor(proceso.manual)}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-900">{fila.valor(proceso.asistido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ETIQUETA_ESTADO: Record<string, string> = {
  en_produccion: "En producción",
  evaluado: "Evaluado",
  planificado: "Planificado",
  entrenando: "Entrenando",
  retirado: "Retirado",
};

const formatearPct = (valor: number) => `${(valor * 100).toFixed(1).replace(".", ",")}%`;

function Tarjeta({
  etiqueta,
  valor,
  resaltado,
}: {
  etiqueta: string;
  valor: string | number;
  resaltado?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{etiqueta}</p>
      <p className={cn("mt-1 text-xl font-semibold", resaltado ? "text-emerald-700" : "text-slate-900")}>
        {valor}
      </p>
    </div>
  );
}

function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      {mensaje}
    </div>
  );
}
