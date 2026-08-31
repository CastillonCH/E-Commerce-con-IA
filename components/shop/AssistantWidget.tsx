"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  MessageCircle,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Gift,
  Package,
  RotateCcw,
  CreditCard,
  Headset,
  type LucideIcon,
} from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";

interface SupportTopic {
  id: string;
  label: string;
  icon: LucideIcon;
  /** navigate: se resuelve dentro de la tienda. info: muestra una respuesta y ofrece WhatsApp como salida. whatsapp: va directo a WhatsApp. */
  kind: "navigate" | "info" | "whatsapp";
  href?: string;
  info?: string;
  whatsappMessage: string;
}

const TOPICS: SupportTopic[] = [
  {
    id: "ofertas",
    label: "Ver ofertas y descuentos",
    icon: Gift,
    kind: "navigate",
    href: "/#catalogo",
    whatsappMessage: "Hola, quiero saber sobre las ofertas del día.",
  },
  {
    id: "pedido",
    label: "Rastrear mi pedido",
    icon: Package,
    kind: "whatsapp",
    whatsappMessage: "Hola, quiero rastrear el estado de mi pedido.",
  },
  {
    id: "devoluciones",
    label: "Cambios y devoluciones",
    icon: RotateCcw,
    kind: "info",
    info: "Tienes 30 días desde la entrega para solicitar un cambio o devolución sin costo, siempre que el producto esté en su empaque original.",
    whatsappMessage: "Hola, quiero hacer un cambio o devolución.",
  },
  {
    id: "pago",
    label: "Problemas con mi pago",
    icon: CreditCard,
    kind: "whatsapp",
    whatsappMessage: "Hola, tengo un problema con el pago de mi compra.",
  },
  {
    id: "asesor",
    label: "Hablar con un asesor",
    icon: Headset,
    kind: "whatsapp",
    whatsappMessage: "Hola, quiero hablar con un asesor.",
  },
];

function whatsappHref(message: string) {
  return `https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Asistente virtual guiado por opciones (sin campo de texto libre): el
 * usuario elige un tema y, según el tema, ve una respuesta dentro de la
 * tienda o pasa a WhatsApp con un asesor humano. Conectar esto a un motor de
 * IA real (respuestas generadas, no solo un árbol de opciones fijo) es
 * trabajo de backend — ver TODO en `handleSelectTopic`.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [activeTopic, setActiveTopic] = useState<SupportTopic | null>(null);
  const [showTeaser, setShowTeaser] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowTeaser(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  function handleSelectTopic(topic: SupportTopic) {
    // TODO(backend): si en el futuro se agregan respuestas generadas por IA
    // (no solo estas opciones fijas), la lógica de "responder" va aquí,
    // llamando a un endpoint tipo POST /api/asistente.
    setActiveTopic(topic);
  }

  function handleOpen() {
    setOpen(true);
    setShowTeaser(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {!open && showTeaser && (
        <div className="flex w-64 animate-[pop-in_0.35s_ease-out] items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <button
            type="button"
            onClick={handleOpen}
            className="flex-1 text-left text-sm text-slate-700"
          >
            <span className="font-semibold text-slate-900">¿Buscas algo en especial?</span>{" "}
            Puedo ayudarte a encontrarlo o conectarte con un asesor. 👋
          </button>
          <button
            type="button"
            onClick={() => setShowTeaser(false)}
            aria-label="Cerrar sugerencia"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] origin-bottom-right animate-[pop-in_0.25s_ease-out] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-brand px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <div className="rounded-full bg-white/15 p-1.5">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Asistente {APP_CONFIG.storeName}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-white/80">
                  <Sparkles className="h-3 w-3" /> Impulsado por IA
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
              className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activeTopic ? (
            <TopicScreen topic={activeTopic} onBack={() => setActiveTopic(null)} />
          ) : (
            <MenuScreen onSelectTopic={handleSelectTopic} />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowTeaser(false);
        }}
        aria-label={open ? "Cerrar asistente virtual" : "Abrir asistente virtual"}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-hover"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Bot className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500 ring-2 ring-white" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

function MenuScreen({ onSelectTopic }: { onSelectTopic: (topic: SupportTopic) => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-slate-50">
      <div className="px-4 pt-4">
        <p className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          ¡Hola! 👋 Soy el asistente virtual de {APP_CONFIG.storeName}. Elige una opción y te ayudo:
        </p>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        {TOPICS.map((topic, index) => (
          <button
            key={topic.id}
            type="button"
            onClick={() => onSelectTopic(topic)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="flex animate-[fade-up_0.3s_ease-out_backwards] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-medium text-slate-800 transition-colors hover:border-brand hover:bg-blue-50/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-brand">
              <topic.icon className="h-4 w-4" />
            </span>
            <span className="flex-1">{topic.label}</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TopicScreen({ topic, onBack }: { topic: SupportTopic; onBack: () => void }) {
  return (
    <div className="flex flex-1 animate-[fade-in_0.2s_ease-out] flex-col overflow-y-auto bg-slate-50">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 pt-4 text-xs font-semibold text-slate-500 hover:text-brand"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver al menú
      </button>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className={cn("rounded-2xl border border-slate-200 bg-white p-4")}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-brand">
              <topic.icon className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-semibold text-slate-900">{topic.label}</p>
          </div>
          <p className="text-sm text-slate-600">
            {topic.kind === "info"
              ? topic.info
              : topic.kind === "navigate"
                ? "Te llevamos directo a esa sección de la tienda."
                : "Para esto te conectamos con un asesor humano por WhatsApp."}
          </p>
          {topic.kind === "navigate" && topic.href && (
            <Link
              href={topic.href}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
            >
              Ir ahora
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {topic.kind !== "navigate" && (
          <a
            href={whatsappHref(topic.whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto flex items-center justify-center gap-2 rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800"
          >
            <MessageCircle className="h-4 w-4" />
            {topic.kind === "info" ? "¿Sigues con dudas? Escríbenos" : "Continuar por WhatsApp"}
          </a>
        )}
      </div>
    </div>
  );
}
