import { Loader2 } from "lucide-react";

export default function ShopLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="flex flex-1 items-center justify-center py-24"
    >
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}
