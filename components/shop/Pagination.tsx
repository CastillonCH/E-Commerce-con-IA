import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
}

// 1 … 4 5 [6] 7 8 … 20: siempre la primera, la última y dos vecinas a
// cada lado de la actual, para que no crezca con el catálogo.
export function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const paginas = new Set([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) paginas.add(p);
  }
  const ordenadas = [...paginas].sort((a, b) => a - b);
  const resultado: (number | "…")[] = [];
  for (const [i, p] of ordenadas.entries()) {
    if (i > 0 && p - ordenadas[i - 1] > 1) resultado.push("…");
    resultado.push(p);
  }
  return resultado;
}

const ARROW_CLASSES =
  "flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100";

export function Pagination({ page, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación de productos"
      className={cn("mt-8 flex items-center justify-center gap-1", className)}
    >
      <Link
        href={buildHref(page - 1)}
        aria-label="Página anterior"
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={cn(ARROW_CLASSES, page <= 1 && "pointer-events-none opacity-30")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="w-6 text-center text-sm text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-label={`Página ${p} de ${totalPages}`}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-medium transition-colors",
              p === page
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        href={buildHref(page + 1)}
        aria-label="Página siguiente"
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        className={cn(ARROW_CLASSES, page >= totalPages && "pointer-events-none opacity-30")}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
