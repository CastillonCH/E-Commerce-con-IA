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
              Cada ficha nueva o modificada pasa por acá antes de publicarse:
              confirma o corrige la categoría que sugiere la IA, o recházala
              con un motivo (política de revisión: &ldquo;todos&rdquo;).
            </>
          ) : (
            <>
              La IA publica sola lo que clasifica con {Math.round(REVIEW_THRESHOLD * 100)}%
              de confianza o más. Aquí llega lo dudoso y las fichas que se
              editaron: confirma o corrige la categoría, o recházala con un motivo.
            </>
          )}
        </p>
      </div>

      <ReviewQueue items={pending} />
    </div>
  );
}
