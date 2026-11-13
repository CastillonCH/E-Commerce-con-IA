"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ui/ProductImage";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Sparkles, UserRound, Info } from "lucide-react";
import type { PendingReviewEntry } from "@/lib/data/products-repo";
import { CATEGORIAS_IA } from "@/lib/taxonomy";
import { MOTIVOS_RECHAZO } from "@/lib/catalogo";
import { cn, formatCurrency } from "@/lib/utils";
import {
  approveReviewAction,
  rejectReviewAction,
} from "@/app/admin/(protected)/revision/actions";

function marcaDeTiempoActual(): number {
  return Date.now();
}
function segundosTranscurridosDesde(inicioMs: number): number {
  return Math.round((marcaDeTiempoActual() - inicioMs) / 1000);
}

// Se revisa de a una ficha: así el tiempo de revisión de cada una es solo
// el suyo (antes corría para todas desde que se abría la página).
export function ReviewQueue({ items, emailActual }: { items: PendingReviewEntry[]; emailActual: string }) {
  // Por defecto, la más antigua; se puede saltar a otra de la cola.
  const [elegidaId, setElegidaId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No hay productos pendientes de revisión.
      </div>
    );
  }

  const actual = items.find((entry) => entry.product.id === elegidaId) ?? items[0];
  const siguientes = items.filter((entry) => entry !== actual);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600" data-testid="cola-revision">
        {items.length === 1 ? "Última ficha en la cola" : `${items.length} fichas en la cola`}
      </p>
      {/* key: al pasar a otra ficha, el cronómetro arranca de cero. */}
      <FichaEnRevision key={actual.product.id} entry={actual} esPropia={actual.cargadoPorEmail === emailActual} />

      {siguientes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Siguientes en la cola</p>
          <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-sm">
            {siguientes.map((entry) => (
              <li key={entry.product.id}>
                <button
                  type="button"
                  onClick={() => setElegidaId(entry.product.id)}
                  className="w-full truncate rounded-md px-2 py-1 text-left text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {entry.product.nombre}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EtiquetaModo({ entry }: { entry: PendingReviewEntry }) {
  if (entry.iaNoDisponible) {
    return <Etiqueta className="bg-amber-50 text-amber-800">Sin sugerencia de la IA al cargarla</Etiqueta>;
  }
  if (entry.modoCarga === "manual") {
    return <Etiqueta className="bg-slate-100 text-slate-700">Cargada sin IA</Etiqueta>;
  }
  if (entry.modoCarga === "asistido") {
    return <Etiqueta className="bg-blue-50 text-blue-700">Cargada con IA</Etiqueta>;
  }
  return null;
}

function Etiqueta({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span data-testid="modo-ficha" className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function FichaEnRevision({ entry, esPropia }: { entry: PendingReviewEntry; esPropia: boolean }) {
  const router = useRouter();
  // Arranca cuando esta ficha aparece en pantalla.
  const [inicio] = useState(() => marcaDeTiempoActual());
  const categoriasDisponibles: readonly string[] = CATEGORIAS_IA[entry.product.departamento] || [];
  const propuesta = entry.origen ? entry.product.categoria_ia : null;
  const [categoria, setCategoria] = useState<string>(
    propuesta && categoriasDisponibles.includes(propuesta) ? propuesta : (categoriasDisponibles[0] ?? ""),
  );
  const [procesando, setProcesando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_RECHAZO[0]);
  const [motivoLibre, setMotivoLibre] = useState("");

  async function aprobar() {
    setProcesando(true);
    const result = await approveReviewAction(entry.product.id, categoria, segundosTranscurridosDesde(inicio));
    if (!result.success) {
      setProcesando(false);
      toast.error(result.error ?? "No se pudo aprobar el producto.");
      return;
    }
    toast.success(`${entry.product.nombre} publicado en la tienda.`);
    router.refresh();
  }

  async function rechazar() {
    const texto = motivo === "otro" ? motivoLibre.trim() : motivo;
    setProcesando(true);
    const result = await rejectReviewAction(entry.product.id, texto, segundosTranscurridosDesde(inicio));
    if (!result.success) {
      setProcesando(false);
      toast.error(result.error ?? "No se pudo rechazar el producto.");
      return;
    }
    toast.success(`${entry.product.nombre} rechazado. El personal de catálogo verá el motivo.`);
    router.refresh();
  }

  return (
    <article
      aria-label={`Revisión de ${entry.product.nombre}`}
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {entry.product.imagen_url ? (
            <ProductImage
              src={entry.product.imagen_url}
              alt={entry.product.nombre}
              fill
              sizes="160px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">Sin foto</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaModo entry={entry} />
            <span className="text-xs text-slate-500">{entry.product.departamento}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">{entry.product.nombre}</h2>
          <p className="text-sm text-slate-500">
            {entry.product.marca} · {formatCurrency(entry.product.precio)}
          </p>
          {entry.product.descripcion && (
            <p className="mt-2 line-clamp-3 text-sm text-slate-600">{entry.product.descripcion}</p>
          )}

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm" data-testid="propuesta-revision">
            {entry.origen === "persona" ? (
              <p className="flex items-center gap-1.5 font-medium text-slate-800">
                <UserRound className="h-4 w-4" />
                Quien la cargó eligió &ldquo;{entry.product.categoria_ia}&rdquo;
              </p>
            ) : entry.origen === "ia" ? (
              <>
                <p className="flex items-center gap-1.5 font-medium text-amber-800">
                  <Sparkles className="h-4 w-4" />
                  La IA sugiere &ldquo;{entry.product.categoria_ia}&rdquo;
                  {entry.confidence !== null && <> con {Math.round(entry.confidence * 100)}% de confianza</>}
                </p>
                {entry.modoCarga === "asistido" &&
                  entry.categoriaPersonal &&
                  entry.categoriaPersonal !== entry.product.categoria_ia && (
                    <p className="mt-1 text-slate-600">
                      Quien la cargó la cambió a &ldquo;{entry.categoriaPersonal}&rdquo;
                    </p>
                  )}
              </>
            ) : (
              <p className="text-slate-600">Sin categoría propuesta: elige una.</p>
            )}
          </div>

          {esPropia && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La cargaste tú: esta revisión no cuenta para la medición sin IA vs con IA.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="categoria-final" className="mb-1 block text-sm font-medium text-slate-700">
            Categoría final
          </label>
          <select
            id="categoria-final"
            value={categoria}
            disabled={procesando}
            onChange={(event) => setCategoria(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-slate-900 disabled:opacity-50"
          >
            {categoriasDisponibles.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={aprobar}
            disabled={procesando || !categoria}
            className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setRechazando(true)}
            disabled={procesando || rechazando}
            className="flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Rechazar
          </button>
        </div>
      </div>

      {rechazando && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="motivo-rechazo" className="mb-1 block text-sm font-medium text-red-800">
              Motivo del rechazo
            </label>
            <select
              id="motivo-rechazo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              disabled={procesando}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
            >
              {MOTIVOS_RECHAZO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="otro">Otro motivo…</option>
            </select>
            {motivo === "otro" && (
              <input
                type="text"
                aria-label="Escribe el motivo"
                value={motivoLibre}
                onChange={(event) => setMotivoLibre(event.target.value)}
                maxLength={300}
                placeholder="Escribe el motivo"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={rechazar}
              disabled={procesando || (motivo === "otro" && motivoLibre.trim().length < 5)}
              className="rounded-full bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={() => setRechazando(false)}
              disabled={procesando}
              className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
