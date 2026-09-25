"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CreditCard, Smartphone, Truck as TruckIcon } from "lucide-react";
import type { PaymentMethod } from "@/types";
import { useCartStore } from "@/store/cart-store";
import { useOrdersStore } from "@/store/orders-store";
import { useHasMounted } from "@/hooks/useHasMounted";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: typeof CreditCard;
}[] = [
  { value: "tarjeta", label: "Tarjeta de crédito/débito", icon: CreditCard },
  { value: "yape_plin", label: "Yape / Plin", icon: Smartphone },
  { value: "contraentrega", label: "Pago contraentrega", icon: TruckIcon },
];

interface CheckoutFormProps {
  nombreInicial: string;
  emailInicial: string;
}

export function CheckoutForm({
  nombreInicial,
  emailInicial,
}: CheckoutFormProps) {
  const router = useRouter();
  const mounted = useHasMounted();
  const items = useCartStore((state) => state.items);
  const totalPrice = useCartStore((state) => state.totalPrice());
  const clearCart = useCartStore((state) => state.clear);
  const addOrder = useOrdersStore((state) => state.addOrder);

  const [nombre, setNombre] = useState(nombreInicial);
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>("tarjeta");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    const orderId = `PED-${Date.now().toString().slice(-8)}`;
    addOrder({
      id: orderId,
      fecha: new Date().toISOString(),
      clienteNombre: nombre,
      clienteEmail: emailInicial,
      direccion: { nombre, direccion, ciudad, telefono },
      metodoPago,
      items: items.map((item) => ({
        productId: item.product.id,
        nombre: item.product.nombre,
        imagen_url: item.product.imagen_url,
        precio: item.product.precio,
        cantidad: item.cantidad,
      })),
      total: totalPrice,
      estado: "pendiente",
    });

    clearCart();
    router.push(`/checkout/confirmacion?pedido=${orderId}`);
  }

  if (!mounted) return null;

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">
          Tu carrito está vacío
        </p>
        <p className="text-sm text-slate-500">
          Añade productos antes de continuar con el pago.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]"
    >
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Dirección de envío
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                required
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Av. Ejemplo 123, Dpto. 4B"
              />
            </div>
            <div>
              <Label htmlFor="ciudad">Ciudad</Label>
              <Input
                id="ciudad"
                required
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                type="tel"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="9xxxxxxxx"
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Método de pago
          </h2>
          <div className="flex flex-col gap-2.5">
            {PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  metodoPago === value
                    ? "border-slate-900 bg-slate-50 text-slate-900"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                <input
                  type="radio"
                  name="metodoPago"
                  value={value}
                  checked={metodoPago === value}
                  onChange={() => setMetodoPago(value)}
                  className="sr-only"
                />
                <Icon className="h-4 w-4" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Resumen del pedido
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map(({ product, cantidad }) => (
            <li key={product.id} className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                <Image
                  src={product.imagen_url}
                  alt={product.nombre}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {product.nombre}
                </p>
                <p className="text-xs text-slate-500">Cant. {cantidad}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-900">
                {formatCurrency(product.precio * cantidad)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-base font-semibold text-slate-900">Total</p>
          <p className="text-lg font-extrabold text-slate-900">
            {formatCurrency(totalPrice)}
          </p>
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-5 w-full">
          {isSubmitting ? "Procesando..." : "Confirmar pedido"}
        </Button>
      </div>
    </form>
  );
}
