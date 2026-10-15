import { listPendingReview, REVIEW_THRESHOLD } from "@/lib/data/products-repo";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export default async function AdminReviewPage() {
  const pending = await listPendingReview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Revisión de IA</h1>
        <p className="mt-1 text-sm text-slate-500">
          Productos cuya clasificación automática tuvo una confianza menor al{" "}
          {Math.round(REVIEW_THRESHOLD * 100)}% y esperan tu validación antes
          de publicarse en la tienda.
        </p>
      </div>

      <ReviewQueue items={pending} />
    </div>
  );
}
