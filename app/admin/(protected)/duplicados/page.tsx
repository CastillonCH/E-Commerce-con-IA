import { listPossibleDuplicates } from "@/lib/data/products-repo";
import { DuplicatesList } from "@/components/admin/DuplicatesList";

export default async function AdminDuplicatesPage() {
  const duplicates = await listPossibleDuplicates();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Posibles duplicados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Productos de una misma marca con nombres muy parecidos: revisa si
          son el mismo producto publicado dos veces.
        </p>
      </div>

      <DuplicatesList pairs={duplicates} />
    </div>
  );
}
