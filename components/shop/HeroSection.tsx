import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";

/** Hero claro y minimalista, en la línea de Samsung.com: blanco, negro y un único acento de color (azul de marca). */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-blue-50 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col items-start gap-5">
          <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            Catálogo clasificado por Inteligencia Artificial
          </span>
          <h1 className="max-w-xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Todo lo que buscas,
            <span className="block text-brand">en un solo lugar.</span>
          </h1>
          <p className="max-w-md text-base text-slate-600 sm:text-lg">
            Miles de productos organizados automáticamente por nuestro motor
            de IA. Envío rápido, pago seguro y un asistente virtual listo
            para ayudarte 24/7.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href="#catalogo"
              className="flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Ver ofertas
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#catalogo"
              className="flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-900"
            >
              Explorar categorías
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-100">
            <Image
              src="https://images.unsplash.com/photo-1607082349566-187342175e2f?q=80&w=1000&auto=format&fit=crop"
              alt="Producto destacado"
              fill
              sizes="(min-width: 1024px) 40vw, 90vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="absolute -bottom-5 -left-5 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-100">
            <p className="text-xs font-medium text-slate-500">Hasta</p>
            <p className="text-2xl font-extrabold text-brand">40% OFF</p>
          </div>
        </div>
      </div>
    </section>
  );
}
