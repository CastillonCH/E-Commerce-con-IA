import { redirect } from "next/navigation";
import { Download, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { obtenerSaludIA } from "@/lib/ai-client";
import {
  listModelosIA,
  METAS_T1,
  obtenerLineaBase,
  obtenerMetricasClasificacion,
  obtenerMetricasDuplicados,
} from "@/lib/data/modelos-repo";
import { cn } from "@/lib/utils";

export default async function AdminModelosPage() {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/admin/dashboard");

  const [salud, modelos, metricasClasificacion, lineaBase, metricasDuplicados] = await Promise.all([
    obtenerSaludIA(),
    listModelosIA(),
    obtenerMetricasClasificacion(),
    obtenerLineaBase(),
    obtenerMetricasDuplicados(),
  ]);

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
          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
        >
          <Download className="h-3.5 w-3.5" />
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
          <p className="text-xs text-slate-600">
            {!salud
              ? "Revisa AI_SERVICE_URL en .env.local y que ai-service esté corriendo (ver ai-service/README.md)."
              : salud.modo === "demo"
                ? "No hay ningún modelo entrenado cargado todavía — las sugerencias se generan con reglas de palabras clave, no son predicciones reales."
                : `Modelos cargados: ${salud.modelosCargados.join(", ")}`}
          </p>
        </div>
      </div>

      {/* Tabla de modelos vs. metas del T1 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Modelos registrados
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">Código</th>
                <th scope="col" className="px-4 py-3 font-medium">Arquitectura</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium">Métricas</th>
                <th scope="col" className="px-4 py-3 font-medium">Meta del T1</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((modelo) => {
                const meta = METAS_T1[modelo.codigo];
                const tieneMetricas = Object.keys(modelo.metricas).length > 0;
                const cumple = tieneMetricas && meta ? meta.cumple(modelo.metricas) : null;
                return (
                  <tr key={modelo.codigo} className="border-b border-slate-100 text-slate-700 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{modelo.codigo}</td>
                    <td className="px-4 py-3">{modelo.arquitectura}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          modelo.estado === "en_produccion" && "bg-emerald-100 text-emerald-700",
                          modelo.estado === "evaluado" && "bg-sky-100 text-sky-700",
                          modelo.estado === "planificado" && "bg-slate-100 text-slate-600",
                        )}
                      >
                        {modelo.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {tieneMetricas
                        ? Object.entries(modelo.metricas)
                            .map(([clave, valor]) => `${clave}: ${typeof valor === "number" ? valor.toFixed(3) : valor}`)
                            .join(" · ")
                        : "Sin entrenar todavía"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {meta ? (
                        <span className={cn("flex items-center gap-1", cumple ? "text-emerald-700" : "text-slate-500")}>
                          {cumple !== null && (cumple ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />)}
                          {meta.etiqueta}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Línea base del problema (T1 1.2.1) */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Línea base: categorización manual del vendedor
        </h2>
        {lineaBase.conCategoriaDelVendedor === 0 ? (
          <EstadoVacio mensaje="Todavía no hay productos con categoría elegida por el vendedor para medir esto." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta etiqueta="Con categoría del vendedor" valor={lineaBase.conCategoriaDelVendedor} />
            <Tarjeta etiqueta="Mal categorizados" valor={lineaBase.malCategorizadosPorVendedor} />
            <Tarjeta
              etiqueta="% de error del vendedor"
              valor={lineaBase.pctErrorVendedor !== null ? `${lineaBase.pctErrorVendedor}%` : "—"}
            />
            <Tarjeta etiqueta="Meta del objetivo general" valor="≤ 5%" />
          </div>
        )}
      </div>

      {/* Métricas de clasificación por modelo (revisiones) */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
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
                      <td className="px-4 py-3 font-mono text-xs">{m.modelo}</td>
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
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
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
      <p className="text-xs text-slate-500">{etiqueta}</p>
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
