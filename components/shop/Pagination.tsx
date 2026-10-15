import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación de productos"
      className="mt-8 flex items-center justify-center gap-2"
    >
      <Link
        href={buildHref(page - 1)}
        aria-label="Página anterior"
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-50 ${
          page <= 1 ? "pointer-events-none opacity-30" : ""
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      <span className="px-3 text-sm font-medium text-slate-700">
        Página {page} de {totalPages}
      </span>

      <Link
        href={buildHref(page + 1)}
        aria-label="Página siguiente"
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-50 ${
          page >= totalPages ? "pointer-events-none opacity-30" : ""
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
