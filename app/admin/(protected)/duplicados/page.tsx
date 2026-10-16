import Image from "next/image";
import { listDetectedDuplicates, listPossibleDuplicates } from "@/lib/data/products-repo";
import { DuplicatesList } from "@/components/admin/DuplicatesList";
import { formatCurrency } from "@/lib/utils";

export default async function AdminDuplicatesPage() {
  const [detectados, respaldoSinIA] = await Promise.all([
    listDetectedDuplicates(),
    listPossibleDuplicates(),
  ]);

  // El respaldo de texto solo aporta algo para productos que la IA (CU5)
  // todavía no comparó — si ya hay un par por embeddings para ese mismo
  // producto, no tiene sentido mostrarlo dos veces con dos criterios.
  const idsConDeteccionIA = new Set(detectados.flatMap((d) => [d.a.id, d.b.id]));
  const respaldoRelevante = respaldoSinIA.filter(
    (par) => !idsConDeteccionIA.has(par.a.id) && !idsConDeteccionIA.has(par.b.id),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Posibles duplicados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pares de productos que podrían ser el mismo publicado dos veces,
          detectados por similitud de embeddings de imagen y texto (CU5).
        </p>
      </div>

      <DuplicatesList pairs={detectados} />

      {respaldoRelevante.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            Respaldo sin IA
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Estos productos todavía no tienen embeddings guardados (el
            servicio de IA puede estar en modo demostración, o no se
            reanalizaron) — esta comparación es solo por similitud de texto
            del nombre, sin ningún modelo de por medio.
          </p>
          <ul className="flex flex-col gap-3">
            {respaldoRelevante.map((pair) => (
              <li
                key={`${pair.a.id}-${pair.b.id}`}
                className="rounded-xl border border-dashed border-slate-300 bg-white p-4"
              >
                <p className="mb-3 text-xs font-medium text-slate-500">
                  {Math.round(pair.score * 100)}% de similitud de texto · {pair.a.marca}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[pair.a, pair.b].map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <Image src={product.imagen_url} alt={product.nombre} fill sizes="48px" className="object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{product.nombre}</p>
                        <p className="text-xs text-slate-500">{formatCurrency(product.precio)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
