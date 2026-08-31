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
      { label: "Rastrea tu pedido", href: "/ayuda" },
      { label: "Cambios y devoluciones", href: "/ayuda" },
      { label: "Preguntas frecuentes", href: "/ayuda" },
      { label: "Libro de reclamaciones", href: "/ayuda" },
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

/** Footer claro, denso en enlaces — como el de Samsung.com, no una franja oscura de marketing. */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-100 bg-white text-slate-600">
      <div className="border-b border-slate-100">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="h-6 w-6 shrink-0 text-brand" />
              <span className="text-xs font-medium text-slate-700 sm:text-sm">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xl font-extrabold text-slate-900">
              Nova<span className="text-brand">Store</span>
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Miles de productos organizados automáticamente para que
              encuentres justo lo que buscas, en segundos.
            </p>
            <div className="mt-4 flex gap-3">
              <Link href="/" aria-label="Facebook" className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <FacebookIcon className="h-4 w-4" />
              </Link>
              <Link href="/" aria-label="Instagram" className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <InstagramIcon className="h-4 w-4" />
              </Link>
              <Link href="/" aria-label="TikTok" className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <TikTokIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold text-slate-900">{column.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-slate-500 hover:text-brand">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} {APP_CONFIG.storeName}. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-brand">Términos y condiciones</Link>
            <Link href="/" className="hover:text-brand">Política de privacidad</Link>
            <Link href="/" className="hover:text-brand">Libro de reclamaciones</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
