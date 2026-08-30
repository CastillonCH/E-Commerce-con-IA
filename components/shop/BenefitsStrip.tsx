import { Truck, ShieldCheck, RotateCcw, Headset } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { formatCurrency } from "@/lib/utils";

const BENEFITS = [
  { icon: Truck, title: "Envío rápido", subtitle: `Gratis desde ${formatCurrency(APP_CONFIG.freeShippingThreshold)}` },
  { icon: ShieldCheck, title: "Pago seguro", subtitle: "Tus datos siempre protegidos" },
  { icon: RotateCcw, title: "Devoluciones fáciles", subtitle: "30 días para cambios" },
  { icon: Headset, title: "Soporte 24/7", subtitle: "Asistente virtual + WhatsApp" },
];

export function BenefitsStrip() {
  return (
    <section className="border-b border-slate-100 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4 sm:px-6">
        {BENEFITS.map(({ icon: Icon, title, subtitle }) => (
          <div key={title} className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
