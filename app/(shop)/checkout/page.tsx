import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { getProductById } from "@/lib/data/products-repo";

interface CheckoutPageProps {
  // ?producto=1&cantidad=2 viene de "Comprar ahora" (compra directa).
  searchParams: Promise<{ producto?: string; cantidad?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const session = await getSession();
  const { producto: productoId, cantidad } = await searchParams;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">
          Inicia sesión para continuar
        </p>
        <p className="text-sm text-slate-500">
          Necesitas una cuenta para completar tu pedido.
        </p>
        <Link
          href={`/login?from=${encodeURIComponent(
            productoId ? `/checkout?producto=${productoId}&cantidad=${cantidad ?? 1}` : "/checkout",
          )}`}
        >
          <Button className="mt-2">Iniciar sesión</Button>
        </Link>
      </div>
    );
  }

  // El precio y el stock salen de la base, no de la URL; la cantidad se
  // acota al stock disponible. Si el producto no existe o está agotado,
  // se cae al checkout normal del carrito.
  const producto = productoId ? await getProductById(productoId) : null;
  const compraDirecta =
    producto && producto.stock > 0
      ? {
          product: producto,
          cantidad: Math.min(Math.max(1, Math.floor(Number(cantidad)) || 1), producto.stock),
        }
      : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Link
        href={compraDirecta ? `/productos/${compraDirecta.product.id}` : "/carrito"}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        {compraDirecta ? "Volver al producto" : "Volver al carrito"}
      </Link>
      <h1 className="mb-8 text-xl font-semibold text-slate-900">
        Finalizar compra
      </h1>
      <CheckoutForm nombreInicial={session.name} compraDirecta={compraDirecta} />
    </div>
  );
}
