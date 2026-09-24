import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { CheckoutForm } from "@/components/shop/CheckoutForm";

export default async function CheckoutPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">Inicia sesión para continuar</p>
        <p className="text-sm text-slate-500">Necesitas una cuenta para completar tu pedido.</p>
        <Link href="/login?from=/checkout">
          <Button className="mt-2">Iniciar sesión</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-xl font-semibold text-slate-900">Finalizar compra</h1>
      <CheckoutForm nombreInicial={session.name} emailInicial={session.email} />
    </div>
  );
}
