import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { Departamento } from "@/types";
import { MOCK_PRODUCTS } from "@/lib/mock-products";

/**
 * Panel que el Navbar monta/desmonta según su propio estado (`openDept`),
 * no CSS `group-hover`: con hover puro, cuando el mouse pasa rápido de un
 * departamento a otro, el panel que se cierra puede tardar en desvanecerse
 * mientras el nuevo ya apareció — ambos visibles a la vez, superpuestos. Con
 * un solo estado en el padre, abrir uno cierra el otro en el mismo render,
 * así nunca puede haber dos abiertos simultáneamente. Usa productos reales
 * del catálogo simulado como vitrina — nada de datos inventados — así que
 * el número de miniaturas varía según cuántos productos tenga ese
 * departamento hoy.
 */
export function DepartmentMegaMenu({ departamento }: { departamento: Departamento }) {
  const featured = MOCK_PRODUCTS.filter((p) => p.departamento === departamento).slice(0, 4);
  const verTodoHref = `/?categoria=${departamento}`;

  return (
    <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
      <div className="animate-[scale-in_0.15s_ease-out] flex gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        {featured.length > 0 && (
          <div className="flex gap-4">
            {featured.map((product) => (
              <Link
                key={product.id}
                href={verTodoHref}
                className="group/item flex w-20 flex-col items-center gap-2 rounded-xl p-1.5 text-center transition-colors hover:bg-slate-50"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-full bg-slate-100 transition-transform duration-200 group-hover/item:scale-105">
                  <Image src={product.imagen_url} alt={product.nombre} fill sizes="64px" className="object-cover" />
                </div>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-700">
                  {product.nombre}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className={featured.length > 0 ? "w-44 shrink-0 border-l border-slate-100 pl-6" : "w-44 shrink-0"}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Explora</p>
          <ul className="flex flex-col gap-2.5 text-sm">
            <li>
              <Link href={verTodoHref} className="flex items-center gap-1 font-medium text-slate-800 hover:text-brand">
                Ver todo
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </li>
            <li>
              <Link href={`${verTodoHref}&nuevo=1`} className="text-slate-600 hover:text-brand">
                Novedades
              </Link>
            </li>
            <li>
              <Link href="/ayuda" className="text-slate-600 hover:text-brand">
                Envíos y devoluciones
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
