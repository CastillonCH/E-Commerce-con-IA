import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { CATEGORIAS_IA, type Departamento } from "@/types";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { cn } from "@/lib/utils";

export type MegaMenuAlign = "left" | "center" | "right";

const ALIGN_CLASSES: Record<MegaMenuAlign, string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
};

export function DepartmentMegaMenu({
  departamento,
  align = "center",
}: {
  departamento: Departamento;
  align?: MegaMenuAlign;
}) {
  const categorias = CATEGORIAS_IA[departamento];
  const departamentoHref = `/?categoria=${encodeURIComponent(departamento)}`;

  return (
    <div
      className={cn(
        "absolute top-full z-50 pt-3",
        ALIGN_CLASSES[align],
      )}
    >
      <div className="animate-[scale-in_0.15s_ease-out] flex gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        {categorias.map((categoria) => {
          const productos = MOCK_PRODUCTS.filter(
            (p) =>
              p.departamento === departamento && p.categoria_ia === categoria,
          ).slice(0, 2);
          const categoriaHref = `${departamentoHref}&subcategoria=${encodeURIComponent(categoria)}`;

          return (
            <div key={categoria} className="w-40 shrink-0">
              <Link
                href={categoriaHref}
                className="mb-3 block text-xs font-semibold uppercase leading-tight tracking-wide text-slate-500 hover:text-brand"
              >
                {categoria}
              </Link>
              <ul className="flex flex-col gap-3">
                {productos.map((producto) => (
                  <li key={producto.id}>
                    <Link
                      href={`/productos/${producto.id}`}
                      className="group/item flex items-center gap-2.5"
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <Image
                          src={producto.imagen_url}
                          alt={producto.nombre}
                          fill
                          sizes="40px"
                          className="object-cover transition-transform duration-200 group-hover/item:scale-105"
                        />
                      </div>
                      <span className="line-clamp-2 text-xs font-medium leading-tight text-slate-700 group-hover/item:text-brand">
                        {producto.nombre}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div className="w-40 shrink-0 border-l border-slate-100 pl-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Explora
          </p>
          <ul className="flex flex-col gap-2.5 text-sm">
            <li>
              <Link
                href={departamentoHref}
                className="flex items-center gap-1 font-medium text-slate-800 hover:text-brand"
              >
                Ver todo
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </li>
            <li>
              <Link
                href={`${departamentoHref}&nuevo=1`}
                className="text-slate-600 hover:text-brand"
              >
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
