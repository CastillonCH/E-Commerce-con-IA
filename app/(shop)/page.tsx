import { Suspense } from "react";
import { HeroSection } from "@/components/shop/HeroSection";
import { BenefitsStrip } from "@/components/shop/BenefitsStrip";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { ProductCarousel } from "@/components/shop/ProductCarousel";
import { listOfertas, listNuevos } from "@/lib/data/products-repo";

interface HomeProps {
  searchParams: Promise<{
    q?: string;
    departamento?: string;
    categoria?: string;
    nuevo?: string;
    page?: string;
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, departamento, categoria, nuevo, page } = await searchParams;
  const soloNuevos = nuevo === "1";
  const currentPage = Math.max(1, Number(page) || 1);

  const mostrarVitrina = !q && !departamento && !categoria && !soloNuevos;

  const [ofertas, nuevos] = await Promise.all([listOfertas(), listNuevos()]);

  const titulo = categoria
    ? categoria
    : departamento
      ? departamento
      : soloNuevos
        ? "Recién llegados"
        : "Productos destacados";

  return (
    <>
      <HeroSection />
      <BenefitsStrip />

      {mostrarVitrina && (
        <>
          <ProductCarousel
            title="Ofertas destacadas"
            products={ofertas}
            viewAllHref="/#catalogo"
          />
          <ProductCarousel
            title="Recién llegados"
            products={nuevos}
            viewAllHref="/?nuevo=1"
          />
        </>
      )}

      <section
        id="catalogo"
        className="mx-auto w-full max-w-7xl flex-1 scroll-mt-20 px-4 py-10 sm:px-6"
      >
        <h2 className="mb-6 text-xl font-semibold text-slate-900">{titulo}</h2>
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductGrid
            q={q}
            departamento={departamento}
            categoria={categoria}
            soloNuevos={soloNuevos}
            page={currentPage}
          />
        </Suspense>
      </section>
    </>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-xl bg-slate-100"
        />
      ))}
    </div>
  );
}
