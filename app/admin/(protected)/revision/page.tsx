import { listPendingReview } from "@/lib/data/products-repo";
import { getServerEnv } from "@/lib/env.server";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export default async function AdminReviewPage() {
  const [pending, { REVIEW_POLICY, REVIEW_THRESHOLD }] = await Promise.all([
    listPendingReview(),
    Promise.resolve(getServerEnv()),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Revisión de IA</h1>
        <p className="mt-1 text-sm text-slate-500">
          {REVIEW_POLICY === "todos" ? (
            <>
              Cada ficha nueva pasa por acá antes de publicarse — el analista
              confirma o corrige la categoría que sugiere la IA (política de
              revisión: &ldquo;todos&rdquo;).
            </>
          ) : (
            <>
              Productos cuya clasificación automática tuvo una confianza menor
              al {Math.round(REVIEW_THRESHOLD * 100)}% y esperan tu validación
              antes de publicarse en la tienda.
            </>
          )}
        </p>
      </div>

      <ReviewQueue items={pending} />
    </div>
  );
}
