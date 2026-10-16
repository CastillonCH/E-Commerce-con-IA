import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AIResultado } from "@/types";
import { cn } from "@/lib/utils";

export function AISuggestionPanel({
  resultado,
  categoriaVendedor,
}: {
  resultado: AIResultado;
  categoriaVendedor: string;
}) {
  const coincide = resultado.categoria === categoriaVendedor;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      {resultado.modo === "demo" && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Modo demostración: el servicio de IA todavía no tiene un modelo
          entrenado — esto es una sugerencia por palabras clave, no una
          predicción real.
        </p>
      )}

      <p className="text-sm font-semibold text-slate-900">
        La IA sugiere: {resultado.categoria}{" "}
        <span className="font-normal text-slate-500">
          ({Math.round(resultado.confidence * 100)}% de confianza)
        </span>
      </p>

      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-xs font-medium",
          coincide ? "text-emerald-700" : "text-amber-700",
        )}
      >
        {coincide ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Coincide con la categoría que elegiste
          </>
        ) : (
          <>
            <XCircle className="h-3.5 w-3.5" />
            No coincide con tu elección (&ldquo;{categoriaVendedor}&rdquo;)
          </>
        )}
      </p>

      {resultado.topK.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {resultado.topK.slice(0, 3).map((entrada) => (
            <div key={entrada.categoria} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-36 shrink-0 truncate">{entrada.categoria}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-1.5 rounded-full bg-slate-900"
                  style={{ width: `${Math.round(entrada.prob * 100)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right">{Math.round(entrada.prob * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
