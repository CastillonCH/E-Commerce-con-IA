import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listPendingReview } from "@/lib/data/products-repo";
import { getServerEnv } from "@/lib/env.server";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export default async function AdminReviewPage() {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/admin/productos");
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
              confirma o corrige la categoría propuesta, o recházala con un
              motivo (política de revisión: &ldquo;todos&rdquo;).
            </>
          ) : (
            <>
              La IA publica sola lo que clasifica con {Math.round(REVIEW_THRESHOLD * 100)}%
              de confianza o más. Aquí llega lo dudoso, las fichas que se
              editaron y todas las cargadas sin IA: confirma o corrige la
              categoría, o recházala con un motivo.
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Se revisa de a una ficha y se mide el tiempo de cada una. En las fichas
          cargadas sin IA ves la categoría que eligió la persona, sin la sugerencia de la IA.
        </p>
      </div>

      <ReviewQueue items={pending} emailActual={session.email} />
    </div>
  );
}
