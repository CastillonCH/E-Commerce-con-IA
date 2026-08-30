export function HeroSection() {
  return (
    <section className="w-full bg-gradient-to-r from-slate-900 to-slate-700">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 py-16 sm:px-6 sm:py-24">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
          Ofertas de temporada
        </span>
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-5xl">
          Todo lo que buscas, clasificado y encontrado en segundos.
        </h1>
        <p className="max-w-xl text-base text-slate-300 sm:text-lg">
          Miles de productos organizados automáticamente por nuestro motor de
          Inteligencia Artificial.
        </p>
      </div>
    </section>
  );
}
