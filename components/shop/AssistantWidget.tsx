"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";

const QUICK_REPLIES = [
  "Rastrear mi pedido",
  "Ver ofertas de hoy",
  "Cambios y devoluciones",
  "Hablar con un asesor",
];

interface ChatMessage {
  from: "bot" | "user";
  text: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    from: "bot",
    text: `¡Hola! 👋 Soy el asistente virtual de ${APP_CONFIG.storeName}. Puedo ayudarte a encontrar productos, rastrear pedidos o resolver dudas. ¿En qué te ayudo hoy?`,
  },
];

function whatsappHref(message: string) {
  return `https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Shell de UI del asistente virtual. Hoy solo simula respuestas y ofrece un
 * handoff real a WhatsApp; conectarlo al motor de IA (RAG sobre el catálogo
 * + historial en el backend) es trabajo pendiente del backend — este
 * componente ya deja el lugar donde enchufar esa respuesta real
 * (ver TODO en `handleSend`).
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  function pushBotReply(userText: string) {
    // TODO(backend): reemplazar por una llamada al motor de IA (p.ej.
    // POST /api/asistente) que devuelva una respuesta real sobre el catálogo.
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          text: `Gracias por tu mensaje. Un asesor puede ayudarte mejor con "${userText}" por WhatsApp — usa el botón de abajo para continuar la conversación ahí.`,
        },
      ]);
    }, 500);
  }

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { from: "user", text: trimmed }]);
    setDraft("");
    pushBotReply(trimmed);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-slate-950 px-4 py-3">
            <div className="flex items-center gap-2 text-white">
              <div className="rounded-full bg-blue-600 p-1.5">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Asistente {APP_CONFIG.storeName}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                  <Sparkles className="h-3 w-3" /> Impulsado por IA
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn("flex", message.from === "user" ? "justify-end" : "justify-start")}
              >
                <p
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    message.from === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  )}
                >
                  {message.text}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => handleSend(reply)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-600"
              >
                {reply}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSend(draft);
            }}
            className="flex items-center gap-2 border-t border-slate-100 p-3"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              aria-label="Enviar"
              className="rounded-full bg-blue-600 p-2 text-white hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <Link
            href={whatsappHref(`Hola, vengo de ${APP_CONFIG.storeName} y necesito ayuda.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800"
          >
            <MessageCircle className="h-4 w-4" />
            Continuar por WhatsApp
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar asistente virtual" : "Abrir asistente virtual"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </div>
  );
}
