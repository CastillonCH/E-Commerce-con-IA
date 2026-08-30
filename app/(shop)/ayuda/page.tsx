import { Package, RotateCcw, CreditCard, MessageCircle } from "lucide-react";

const TOPICS = [
  { icon: Package, title: "Rastrea tu pedido", subtitle: "Consulta el estado de tu envío en tiempo real." },
  { icon: RotateCcw, title: "Cambios y devoluciones", subtitle: "Tienes 30 días para solicitar un cambio." },
  { icon: CreditCard, title: "Métodos de pago", subtitle: "Tarjetas, billeteras digitales y hasta 12 cuotas." },
  { icon: MessageCircle, title: "Habla con nosotros", subtitle: "Usa el asistente virtual o escríbenos por WhatsApp." },
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-14 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Centro de Ayuda</h1>
      <p className="mt-2 text-sm text-slate-500">
        Encuentra respuestas rápidas o abre el asistente virtual en la esquina inferior derecha.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TOPICS.map(({ icon: Icon, title, subtitle }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <Icon className="mb-3 h-5 w-5 text-blue-600" />
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
