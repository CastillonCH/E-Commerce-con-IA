import { Suspense } from "react";
import { HeroSection } from "@/components/shop/HeroSection";
import { BenefitsStrip } from "@/components/shop/BenefitsStrip";
import { ProductGrid } from "@/components/shop/ProductGrid";

interface HomeProps {
  searchParams: Promise<{ q?: string; categoria?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, categoria } = await searchParams;

  return (
    <>
      <HeroSection />
      <BenefitsStrip />
      <section id="catalogo" className="mx-auto w-full max-w-7xl flex-1 scroll-mt-20 px-4 py-10 sm:px-6">
        <h2 className="mb-6 text-xl font-semibold text-slate-900">
          {categoria ? categoria : "Productos destacados"}
        </h2>
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductGrid q={q} categoria={categoria} />
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
