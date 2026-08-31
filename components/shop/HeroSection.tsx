import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-slate-950">
      {/* Glow decorativo, look "tech premium" */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-20 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col items-start gap-5">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
            Catálogo clasificado por Inteligencia Artificial
          </span>
          <h1 className="max-w-xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Todo lo que buscas,
            <span className="block bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent">
              en un solo lugar.
            </span>
          </h1>
          <p className="max-w-md text-base text-slate-300 sm:text-lg">
            Miles de productos organizados automáticamente por nuestro motor
            de IA. Envío rápido, pago seguro y un asistente virtual listo
            para ayudarte 24/7.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href="#catalogo"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Ver ofertas
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#catalogo"
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Explorar categorías
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="relative aspect-square overflow-hidden rounded-3xl ring-1 ring-white/10">
            <Image
              src="https://images.unsplash.com/photo-1607082349566-187342175e2f?q=80&w=1000&auto=format&fit=crop"
              alt="Producto destacado"
              fill
              sizes="(min-width: 1024px) 40vw, 90vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="absolute -bottom-5 -left-5 rounded-2xl bg-white px-4 py-3 shadow-xl">
            <p className="text-xs font-medium text-slate-500">Hasta</p>
            <p className="text-2xl font-extrabold text-orange-600">40% OFF</p>
          </div>
        </div>
      </div>
    </section>
  );
}
