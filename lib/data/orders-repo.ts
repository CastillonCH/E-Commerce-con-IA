import "server-only";
import { query, queryOne } from "@/lib/db";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  ShippingAddress,
} from "@/types";

interface PedidoRow {
  id: string; // codigo, p. ej. "PED-10000001"
  fecha: Date;
  clienteNombre: string;
  clienteEmail: string;
  envio_direccion: string;
  envio_ciudad: string;
  envio_telefono: string;
  metodoPago: PaymentMethod;
  total: number;
  estado: OrderStatus;
  items: OrderItem[];
}

// pedidos.codigo (no el id interno bigint) es el identificador que usa todo
// el frontend ("PED-..."): URLs de confirmación, /admin/pedidos, etc.
const SELECT_PEDIDOS = `
  SELECT
    pe.codigo                AS id,
    pe.creado_en              AS fecha,
    pe.envio_nombre           AS "clienteNombre",
    u.email::text             AS "clienteEmail",
    pe.envio_direccion,
    pe.envio_ciudad,
    pe.envio_telefono,
    pe.metodo_pago            AS "metodoPago",
    pe.total::float8          AS total,
    pe.estado,
    COALESCE(
      json_agg(
        json_build_object(
          'productId', pi.producto_id::text,
          'nombre', pi.nombre_producto,
          'imagen_url', pi.imagen_url,
          'precio', pi.precio_unitario::float8,
          'cantidad', pi.cantidad
        ) ORDER BY pi.id
      ) FILTER (WHERE pi.id IS NOT NULL),
      '[]'
    )                          AS items
  FROM pedidos pe
  JOIN usuarios u ON u.id = pe.cliente_id
  LEFT JOIN pedido_items pi ON pi.pedido_id = pe.id
`;

function toOrder(row: PedidoRow): Order {
  return {
    id: row.id,
    fecha: row.fecha.toISOString(),
    clienteNombre: row.clienteNombre,
    clienteEmail: row.clienteEmail,
    direccion: {
      nombre: row.clienteNombre,
      direccion: row.envio_direccion,
      ciudad: row.envio_ciudad,
      telefono: row.envio_telefono,
    },
    metodoPago: row.metodoPago,
    items: row.items,
    total: row.total,
    estado: row.estado,
  };
}

async function getOrderByCodigo(codigo: string): Promise<Order | null> {
  const row = await queryOne<PedidoRow>(
    `${SELECT_PEDIDOS} WHERE pe.codigo = $1 GROUP BY pe.id, u.email`,
    [codigo],
  );
  return row ? toOrder(row) : null;
}

export interface CreateOrderInput {
  clienteEmail: string;
  direccion: ShippingAddress;
  metodoPago: PaymentMethod;
  items: { productId: string; cantidad: number }[];
}

// Delega en fn_crear_pedido(): la base ignora cualquier nombre/precio que
// mande el cliente y toma precio, stock, vendedor e imagen directo de
// `productos` (trg_pedido_items_antes) — por eso aquí solo se envían
// productId y cantidad, nunca un precio de confianza del cliente.
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const cliente = await queryOne<{ id: string }>(
    `SELECT id::text AS id FROM usuarios WHERE email = $1`,
    [input.clienteEmail],
  );
  if (!cliente) throw new Error("Cliente no encontrado");

  const itemsJson = JSON.stringify(
    input.items.map((item) => ({
      producto_id: Number(item.productId),
      cantidad: item.cantidad,
    })),
  );

  const result = await queryOne<{ codigo: string }>(
    `SELECT (fn_crear_pedido($1, $2::jsonb, $3, $4, $5, $6, $7)).codigo AS codigo`,
    [
      cliente.id,
      itemsJson,
      input.metodoPago,
      input.direccion.nombre,
      input.direccion.direccion,
      input.direccion.ciudad,
      input.direccion.telefono,
    ],
  );
  if (!result) throw new Error("No se pudo crear el pedido");

  const order = await getOrderByCodigo(result.codigo);
  if (!order) throw new Error("No se pudo crear el pedido");
  return order;
}

export async function listOrders(): Promise<Order[]> {
  const rows = await query<PedidoRow>(
    `${SELECT_PEDIDOS} GROUP BY pe.id, u.email ORDER BY pe.creado_en DESC`,
  );
  return rows.map(toOrder);
}

export async function listOrdersByEmail(email: string): Promise<Order[]> {
  const rows = await query<PedidoRow>(
    `${SELECT_PEDIDOS} WHERE u.email = $1 GROUP BY pe.id, u.email ORDER BY pe.creado_en DESC`,
    [email.trim()],
  );
  return rows.map(toOrder);
}

// Lanza si el pedido ya está entregado/cancelado: trg_pedidos_cambio_estado
// lo bloquea en la base (un pedido en estado final no puede reabrirse).
export async function updateOrderStatus(
  orderId: string,
  estado: OrderStatus,
): Promise<Order | null> {
  const updated = await queryOne<{ codigo: string }>(
    `UPDATE pedidos SET estado = $2 WHERE codigo = $1 RETURNING codigo`,
    [orderId, estado],
  );
  if (!updated) return null;
  return getOrderByCodigo(updated.codigo);
}
