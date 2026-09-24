import Image from "next/image";
import { notFound } from "next/navigation";
import { Star, Truck, ShieldCheck } from "lucide-react";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { formatCurrency, discountPercent } from "@/lib/utils";
import { ProductDetailActions } from "@/components/shop/ProductDetailActions";
import { ProductCarousel } from "@/components/shop/ProductCarousel";

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Página de detalle del producto. Hoy resuelve contra MOCK_PRODUCTS; cuando
 * exista `GET /api/productos/{id}` en el backend, reemplazar la búsqueda de
 * abajo por esa llamada (misma forma de `Product`, así que el resto de la
 * página no cambia).
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = MOCK_PRODUCTS.find((p) => p.id === id);

  if (!product) {
    notFound();
  }

  const discount = discountPercent(product.precio, product.precioOriginal);
  const relacionados = MOCK_PRODUCTS.filter(
    (p) => p.departamento === product.departamento && p.id !== product.id
  );

  return (
    <div className="flex-1">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-14">
        <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-slate-100">
          <Image
            src={product.imagen_url}
            alt={product.nombre}
            fill
            sizes="(min-width: 1024px) 40vw, 90vw"
            className="object-cover"
            priority
          />
          {discount && (
            <span className="absolute left-3 top-3 rounded-full bg-orange-500 px-2.5 py-1 text-xs font-bold text-slate-950">
              -{discount}%
            </span>
          )}
          {product.esNuevo && (
            <span className="absolute right-3 top-3 rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">
              Nuevo
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {product.marca} · {product.departamento}
            </span>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
              {product.nombre}
            </h1>
          </div>

          {product.rating !== undefined && (
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
              <span className="font-semibold text-slate-900">{product.rating.toFixed(1)}</span>
              {product.numResenas !== undefined && <span>({product.numResenas} reseñas)</span>}
            </div>
          )}

          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-extrabold text-slate-900">
              {formatCurrency(product.precio)}
            </p>
            {product.precioOriginal && (
              <p className="text-base text-slate-500 line-through">
                {formatCurrency(product.precioOriginal)}
              </p>
            )}
          </div>

          {product.descripcion && (
            <p className="text-sm leading-relaxed text-slate-600">{product.descripcion}</p>
          )}

          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            {product.envioGratis && (
              <p className="flex items-center gap-2 font-medium text-green-700">
                <Truck className="h-4 w-4" />
                Envío gratis a todo el Perú
              </p>
            )}
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              Categoría asignada por nuestro motor de IA: {product.categoria_ia}
            </p>
          </div>

          <ProductDetailActions product={product} />
        </div>
      </div>

      {relacionados.length > 0 && (
        <ProductCarousel title="Productos relacionados" products={relacionados} />
      )}
    </div>
  );
}
