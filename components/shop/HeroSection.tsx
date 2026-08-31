import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";

/** Hero claro y minimalista, en la línea de Samsung.com: fondo degradado suave, tipografía enorme, un único acento de color. */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-white">
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col items-start gap-3">
          <p className="animate-[fade-up_0.5s_ease-out_backwards] text-sm font-medium text-slate-600">
            Conoce lo nuevo, organizado automáticamente por IA
          </p>
          <h1 className="animate-[fade-up_0.5s_ease-out_0.08s_backwards] max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Todo lo que buscas,
            <span className="mt-1 flex items-center gap-2 text-brand">
              en un solo lugar
              <Sparkles className="h-8 w-8 sm:h-10 sm:w-10" />
            </span>
          </h1>
          <p className="animate-[fade-up_0.5s_ease-out_0.16s_backwards] max-w-md text-base text-slate-600 sm:text-lg">
            Miles de productos organizados automáticamente por nuestro motor
            de IA. Envío rápido, pago seguro y un asistente virtual listo
            para ayudarte 24/7.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-5 animate-[fade-up_0.5s_ease-out_0.24s_backwards]">
            <Link
              href="#catalogo"
              className="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-900"
            >
              Conoce más
            </Link>
            <Link
              href="#catalogo"
              className="flex items-center gap-2 rounded-full border border-slate-900 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-900 hover:text-white"
            >
              Comprar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md animate-[fade-up_0.6s_ease-out_0.1s_backwards] lg:max-w-lg">
          {/* Glow decorativo detrás del producto, sin marco de tarjeta alrededor de la foto */}
          <div className="absolute inset-8 -z-10 rounded-full bg-gradient-to-br from-blue-100 to-orange-50 blur-2xl" />
          <div className="relative aspect-square animate-[float_5s_ease-in-out_infinite]">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-100 shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1000&auto=format&fit=crop"
                alt="Producto destacado"
                fill
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="absolute -bottom-2 -left-2 animate-[pop-in_0.4s_ease-out_0.5s_backwards] rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-slate-100">
            <p className="text-xs font-medium text-slate-500">Hasta</p>
            <p className="text-2xl font-extrabold text-brand">40% OFF</p>
          </div>
        </div>
      </div>
    </section>
  );
}
