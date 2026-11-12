import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { MenuCategoria } from "@/lib/data/products-repo";
import { CATEGORIAS_IA, catalogoHref, type Departamento } from "@/lib/taxonomy";
import { DEPARTMENT_ICONS } from "@/components/shop/department-icons";
import { cn } from "@/lib/utils";

export type MegaMenuAlign = "left" | "center" | "right";

const ALIGN_CLASSES: Record<MegaMenuAlign, string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
};

// Solo enlaces a categorías, nunca productos ni marcas: así el menú se ve
// igual con 3 productos que con 3000. Los productos se ven en la página
// de la categoría, con filtros y paginación.
export function DepartmentMegaMenu({
  departamento,
  resumen,
  align = "center",
}: {
  departamento: Departamento;
  resumen: MenuCategoria[];
  align?: MegaMenuAlign;
}) {
  const Icon = DEPARTMENT_ICONS[departamento];
  const departamentoHref = catalogoHref(departamento);
  const categorias = CATEGORIAS_IA[departamento].map((categoria) => {
    const info = resumen.find(
      (r) => r.departamento === departamento && r.categoria === categoria,
    );
    return { categoria, total: info?.total ?? 0 };
  });

  return (
    <div className={cn("absolute top-full z-50 pt-3", ALIGN_CLASSES[align])}>
      <div className="w-[min(46rem,calc(100vw-2rem))] animate-[scale-in_0.15s_ease-out] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
          <Link
            href={departamentoHref}
            className="group/dep flex items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold text-slate-900 group-hover/dep:text-brand">
              {departamento}
            </span>
          </Link>
          <Link
            href={departamentoHref}
            className="flex items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Ver todo {departamento}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-6 p-6">
          {categorias.map(({ categoria, total }) => {
            const categoriaHref = catalogoHref(departamento, categoria);
            return (
              <div key={categoria} className="min-w-0">
                <Link
                  href={categoriaHref}
                  className="block text-sm font-bold leading-tight text-slate-900 hover:text-brand"
                >
                  {categoria}
                </Link>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  <li>
                    <Link
                      href={categoriaHref}
                      className="font-semibold text-slate-800 hover:text-brand"
                    >
                      Ver todo
                      {total > 0 && (
                        <span className="ml-1 font-normal text-slate-500">({total})</span>
                      )}
                    </Link>
                  </li>
                  {total === 0 && (
                    <li className="text-xs text-slate-500">Pronto más productos</li>
                  )}
                </ul>
              </div>
            );
          })}

          <div className="min-w-0 border-l border-slate-100 pl-6">
            <p className="text-sm font-bold text-slate-900">Explora</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              <li>
                <Link
                  href={`${departamentoHref}?ofertas=1`}
                  className="text-slate-600 hover:text-brand"
                >
                  Ofertas
                </Link>
              </li>
              <li>
                <Link
                  href={`${departamentoHref}?orden=nuevos`}
                  className="text-slate-600 hover:text-brand"
                >
                  Novedades
                </Link>
              </li>
              <li>
                <Link
                  href={`${departamentoHref}?orden=valorados`}
                  className="text-slate-600 hover:text-brand"
                >
                  Mejor valorados
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
    </div>
  );
}
