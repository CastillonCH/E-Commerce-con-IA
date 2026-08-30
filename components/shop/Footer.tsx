import Link from "next/link";
import { ShieldCheck, Truck, RotateCcw, CreditCard } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { formatCurrency } from "@/lib/utils";
import { FacebookIcon, InstagramIcon, TikTokIcon } from "@/components/shop/SocialIcons";

const COLUMNS = [
  {
    title: "Sobre Nosotros",
    links: [
      { label: "Quiénes somos", href: "/" },
      { label: "Trabaja con nosotros", href: "/" },
      { label: "Sostenibilidad", href: "/" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { label: "Rastrea tu pedido", href: "/" },
      { label: "Cambios y devoluciones", href: "/" },
      { label: "Preguntas frecuentes", href: "/" },
      { label: "Libro de reclamaciones", href: "/" },
    ],
  },
  {
    title: "Categorías",
    links: [
      { label: "Electrónica", href: "/?categoria=Electronica" },
      { label: "Moda", href: "/?categoria=Moda" },
      { label: "Hogar", href: "/?categoria=Hogar" },
      { label: "Deportes", href: "/?categoria=Deportes" },
    ],
  },
];

const TRUST_ITEMS = [
  { icon: Truck, label: `Envío gratis desde ${formatCurrency(APP_CONFIG.freeShippingThreshold)}` },
  { icon: RotateCcw, label: "Devoluciones en 30 días" },
  { icon: ShieldCheck, label: "Pago 100% seguro" },
  { icon: CreditCard, label: "Hasta 12 cuotas sin intereses" },
];

export function Footer() {
  return (
    <footer className="mt-16 bg-slate-950 text-slate-400">
      <div className="border-b border-slate-800">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="h-6 w-6 shrink-0 text-blue-500" />
              <span className="text-xs font-medium text-slate-300 sm:text-sm">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xl font-extrabold text-white">
              Nova<span className="text-blue-500">Store</span>
            </p>
            <p className="mt-3 text-sm">
              Miles de productos, clasificados automáticamente por nuestro
              motor de Inteligencia Artificial.
            </p>
            <div className="mt-4 flex gap-3">
              <Link href="/" aria-label="Facebook" className="rounded-full bg-slate-800 p-2 hover:bg-slate-700">
                <FacebookIcon className="h-4 w-4" />
              </Link>
              <Link href="/" aria-label="Instagram" className="rounded-full bg-slate-800 p-2 hover:bg-slate-700">
                <InstagramIcon className="h-4 w-4" />
              </Link>
              <Link href="/" aria-label="TikTok" className="rounded-full bg-slate-800 p-2 hover:bg-slate-700">
                <TikTokIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold text-white">{column.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} {APP_CONFIG.storeName}. Todos los derechos reservados.</p>
          <p>Hecho con IA para clasificar mejor lo que compras.</p>
        </div>
      </div>
    </footer>
  );
}
