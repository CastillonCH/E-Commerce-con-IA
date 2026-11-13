import "server-only";
import { query, queryOne, isPgError, PG_ERROR } from "@/lib/db";
import { getServerEnv } from "@/lib/env.server";
import type { ClasificarResponse } from "@/lib/ai-client";
import type { Product, Departamento, ProductStatus } from "@/types";
import { similarity } from "@/lib/similarity";

interface ProductRow {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  marca: string;
  departamento: string;
  imagen_url: string | null;
  categoria_ia: string;
  precioOriginal: number | null;
  rating: number | null;
  numResenas: number | null;
  envioGratis: boolean;
  esNuevo: boolean;
  descripcion: string | null;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    nombre: row.nombre,
    precio: row.precio,
    stock: row.stock,
    marca: row.marca,
    departamento: row.departamento as Departamento,
    imagen_url: row.imagen_url ?? "",
    categoria_ia: row.categoria_ia,
    precioOriginal: row.precioOriginal ?? undefined,
    rating: row.rating ?? undefined,
    numResenas: row.numResenas ?? undefined,
    envioGratis: row.envioGratis,
    esNuevo: row.esNuevo,
    descripcion: row.descripcion ?? undefined,
  };
}

export interface ProductFilters {
  q?: string;
  departamento?: string;
  categoria?: string;
  soloNuevos?: boolean;
}

// v_productos_tienda ya filtra WHERE estado = 'publicado' y devuelve
// exactamente la forma de Product (ver el script de la base de datos).
export async function listProducts(
  filters: ProductFilters = {},
): Promise<Product[]> {
  const { q, departamento, categoria, soloNuevos } = filters;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    params.push(q);
    const i = params.length;
    conditions.push(
      `(f_unaccent(lower(nombre)) LIKE '%' || f_unaccent(lower($${i})) || '%'
        OR f_unaccent(lower(marca)) LIKE '%' || f_unaccent(lower($${i})) || '%')`,
    );
  }
  if (departamento) {
    params.push(departamento);
    conditions.push(`departamento = $${params.length}`);
  }
  if (categoria) {
    params.push(categoria);
    conditions.push(`categoria_ia = $${params.length}`);
  }
  if (soloNuevos) {
    conditions.push(`"esNuevo" = true`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda ${where} ORDER BY id::bigint`,
    params,
  );
  return rows.map(toProduct);
}

export interface MenuCategoria {
  departamento: Departamento;
  categoria: string;
  total: number;
}

// Lo que necesita el mega menú: cuántos productos publicados hay por
// categoría. Se agrega en SQL para no mandar el catálogo entero al
// navegador en cada página — con miles de productos el menú pesa lo
// mismo que con diez.
export async function getMenuResumen(): Promise<MenuCategoria[]> {
  const rows = await query<{ departamento: string; categoria: string; total: number }>(
    `SELECT departamento, categoria_ia AS categoria, count(*)::int AS total
       FROM v_productos_tienda
      GROUP BY departamento, categoria_ia`,
  );
  return rows.map((row) => ({
    departamento: row.departamento as Departamento,
    categoria: row.categoria,
    total: row.total,
  }));
}

export async function getProductById(id: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE id = $1`,
    [id],
  );
  return row ? toProduct(row) : null;
}

// v_productos_tienda no trae categoria_manual_id (no es parte del contrato
// público de Product) — EditProductForm lo necesita para preseleccionar el
// <select> de la categoría elegida a mano.
export async function getCategoriaManualNombre(productId: string): Promise<string | null> {
  const row = await queryOne<{ nombre: string | null }>(
    `SELECT c.nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_manual_id
      WHERE p.id = $1`,
    [productId],
  );
  return row?.nombre ?? null;
}

export async function listOfertas(): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda
      WHERE "precioOriginal" IS NOT NULL AND "precioOriginal" > precio
      ORDER BY id::bigint`,
  );
  return rows.map(toProduct);
}

export async function listNuevos(): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE "esNuevo" = true ORDER BY id::bigint`,
  );
  return rows.map(toProduct);
}

export async function listRelacionados(product: Product): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE departamento = $1 AND id <> $2 ORDER BY id::bigint`,
    [product.departamento, product.id],
  );
  return rows.map(toProduct);
}

export async function listByMarca(marca: string): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE marca ILIKE $1 ORDER BY id::bigint`,
    [marca],
  );
  return rows.map(toProduct);
}

// --- Catálogo del panel: TODOS los estados --------------------------------
// v_productos_tienda solo devuelve lo publicado (es lo que ve el cliente).
// El personal necesita ver también lo que está en revisión, rechazado,
// pausado o archivado — si no, esos productos quedan invisibles para todos.
export interface AdminProduct extends Product {
  estado: ProductStatus;
  motivoRechazo: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  actualizadoEn: string;
  // true si aparece en algún pedido: entonces no se puede eliminar, solo archivar.
  vendido: boolean;
}

interface AdminProductRow extends ProductRow {
  estado: ProductStatus;
  motivo_rechazo: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  actualizado_en: Date;
  vendido: boolean;
}

const SELECT_ADMIN = `
  SELECT
    p.id::text                                  AS id,
    p.nombre,
    p.precio::float8                            AS precio,
    p.stock,
    m.nombre::text                              AS marca,
    d.nombre                                    AS departamento,
    img.url                                     AS imagen_url,
    COALESCE(c.nombre, 'Sin categoría')         AS categoria_ia,
    p.precio_original::float8                   AS "precioOriginal",
    p.rating_promedio::float8                   AS rating,
    p.num_resenas                               AS "numResenas",
    p.envio_gratis                              AS "envioGratis",
    p.es_nuevo                                  AS "esNuevo",
    p.descripcion,
    p.estado,
    p.motivo_rechazo,
    p.proveedor_id::text                        AS proveedor_id,
    pr.nombre                                   AS proveedor,
    p.actualizado_en,
    EXISTS (SELECT 1 FROM pedido_items pi WHERE pi.producto_id = p.id) AS vendido
  FROM productos p
  JOIN marcas m ON m.id = p.marca_id
  JOIN departamentos d ON d.id = p.departamento_id
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
  LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
`;

function toAdminProduct(row: AdminProductRow): AdminProduct {
  return {
    ...toProduct(row),
    estado: row.estado,
    motivoRechazo: row.motivo_rechazo,
    proveedorId: row.proveedor_id,
    proveedor: row.proveedor,
    actualizadoEn: row.actualizado_en.toISOString(),
    vendido: row.vendido,
  };
}

export async function listAdminProducts(estado?: ProductStatus): Promise<AdminProduct[]> {
  const rows = await query<AdminProductRow>(
    estado
      ? `${SELECT_ADMIN} WHERE p.estado = $1 ORDER BY p.actualizado_en DESC, p.id DESC`
      : `${SELECT_ADMIN} ORDER BY p.actualizado_en DESC, p.id DESC`,
    estado ? [estado] : [],
  );
  return rows.map(toAdminProduct);
}

export async function getAdminProductById(id: string): Promise<AdminProduct | null> {
  if (!/^\d+$/.test(id)) return null;
  const row = await queryOne<AdminProductRow>(`${SELECT_ADMIN} WHERE p.id = $1`, [id]);
  return row ? toAdminProduct(row) : null;
}

export async function countProductsByEstado(): Promise<Record<ProductStatus, number>> {
  const rows = await query<{ estado: ProductStatus; total: number }>(
    `SELECT estado, count(*)::int AS total FROM productos GROUP BY estado`,
  );
  const conteo: Record<ProductStatus, number> = {
    pendiente_revision: 0,
    publicado: 0,
    rechazado: 0,
    pausado: 0,
    archivado: 0,
  };
  for (const row of rows) {
    if (row.estado in conteo) conteo[row.estado] = row.total;
  }
  return conteo;
}

async function upsertMarca(nombre: string): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM marcas WHERE nombre = $1`,
    [nombre],
  );
  if (existing) return existing.id;
  const created = await queryOne<{ id: number }>(
    `INSERT INTO marcas (nombre) VALUES ($1) RETURNING id`,
    [nombre],
  );
  return created!.id;
}

async function getDepartamentoId(nombre: Departamento): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM departamentos WHERE nombre = $1`,
    [nombre],
  );
  if (!row) throw new Error(`Departamento desconocido: ${nombre}`);
  return row.id;
}

export interface ProductPatch {
  nombre?: string;
  descripcion?: string;
  precio?: number;
  stock?: number;
  marca?: string;
  departamento?: Departamento;
  // Solo tiene efecto si `departamento` también viene en el mismo patch
  // (el formulario de edición siempre manda los dos juntos) — necesita
  // resolverse dentro de ese departamento por fk_productos_categoria_depto.
  categoriaManual?: string;
  // null = sin proveedor; undefined = no se toca.
  proveedorId?: string | null;
}

export interface UpdateProductResult {
  found: boolean;
  // true si el cambio devolvió el producto a revisión (ver abajo).
  pendingReview: boolean;
}

// Usado por EditProductForm (vía Server Action). No toca la categoría
// FINAL ni la imagen — eso pasa por reclassifyProduct cuando se reemplaza
// la foto.
//
// Cambios menores (precio, stock, marca, proveedor) se aplican directo.
// Cambios que alteran QUÉ es el producto (nombre, descripción, departamento
// o categoría) lo devuelven a revisión: si no, una ficha ya aprobada podría
// convertirse en otra cosa sin que nadie la revise. Un producto rechazado
// también vuelve a revisión al guardarlo: así se corrige y se reenvía.
export async function updateProductRecord(
  id: string,
  patch: ProductPatch,
): Promise<UpdateProductResult> {
  const actual = await queryOne<{
    nombre: string;
    descripcion: string | null;
    departamento: string;
    categoria_manual: string | null;
    estado: ProductStatus;
  }>(
    `SELECT p.nombre, p.descripcion, d.nombre AS departamento, c.nombre AS categoria_manual, p.estado
       FROM productos p
       JOIN departamentos d ON d.id = p.departamento_id
       LEFT JOIN categorias c ON c.id = p.categoria_manual_id
      WHERE p.id = $1`,
    [id],
  );
  if (!actual || actual.estado === "archivado") return { found: false, pendingReview: false };

  const cambioImportante =
    (patch.nombre !== undefined && patch.nombre !== actual.nombre) ||
    (patch.descripcion !== undefined && patch.descripcion !== (actual.descripcion ?? "")) ||
    (patch.departamento !== undefined && patch.departamento !== actual.departamento) ||
    (patch.categoriaManual !== undefined && patch.categoriaManual !== actual.categoria_manual);
  const vuelveARevision =
    actual.estado === "rechazado" ||
    (cambioImportante && (actual.estado === "publicado" || actual.estado === "pausado"));

  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.nombre !== undefined) {
    params.push(patch.nombre);
    sets.push(`nombre = $${params.length}`);
  }
  if (patch.descripcion !== undefined) {
    params.push(patch.descripcion);
    sets.push(`descripcion = $${params.length}`);
  }
  if (patch.precio !== undefined) {
    params.push(patch.precio);
    sets.push(`precio = $${params.length}`);
  }
  if (patch.stock !== undefined) {
    params.push(patch.stock);
    sets.push(`stock = $${params.length}`);
  }
  if (patch.marca !== undefined) {
    const marcaId = await upsertMarca(patch.marca);
    params.push(marcaId);
    sets.push(`marca_id = $${params.length}`);
  }
  let departamentoId: number | undefined;
  if (patch.departamento !== undefined) {
    departamentoId = await getDepartamentoId(patch.departamento);
    params.push(departamentoId);
    sets.push(`departamento_id = $${params.length}`);
  }
  if (patch.categoriaManual !== undefined && departamentoId !== undefined) {
    const categoria = await queryOne<{ id: number }>(
      `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
      [patch.categoriaManual, departamentoId],
    );
    if (!categoria) {
      throw new Error(`La categoría "${patch.categoriaManual}" no pertenece al departamento ${patch.departamento}.`);
    }
    params.push(categoria.id);
    sets.push(`categoria_manual_id = $${params.length}`);
  }
  if (patch.proveedorId !== undefined) {
    params.push(patch.proveedorId);
    sets.push(`proveedor_id = $${params.length}`);
  }
  if (vuelveARevision) {
    sets.push(`estado = 'pendiente_revision'`);
  }

  if (sets.length === 0) return { found: true, pendingReview: false };

  params.push(id);
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id::text AS id`,
    params,
  );
  return { found: result !== null, pendingReview: vuelveARevision };
}

// Reemplaza la foto principal y vuelve a clasificar (F4.3: "al editar,
// permite reemplazar la foto y vuelve a clasificar"). El producto vuelve a
// pendiente_revision salvo que REVIEW_POLICY="umbral" y la nueva confianza
// alcance el umbral — mismo criterio que al dar de alta.
export interface ReclassifyInput {
  productId: string;
  nombre: string;
  descripcion: string;
  imagenUrl: string;
  clasificacion: ClasificarResponse | null;
}

export interface ReclassifyResult {
  pendingReview: boolean;
}

export async function reclassifyProduct(input: ReclassifyInput): Promise<ReclassifyResult> {
  const producto = await queryOne<{ departamento_id: number }>(
    `SELECT departamento_id FROM productos WHERE id = $1`,
    [input.productId],
  );
  if (!producto) throw new Error("Producto no encontrado.");

  await query(
    `UPDATE producto_imagenes SET es_principal = false WHERE producto_id = $1 AND es_principal`,
    [input.productId],
  );
  const imagen = await queryOne<{ id: string }>(
    `INSERT INTO producto_imagenes (producto_id, url, es_principal) VALUES ($1, $2, true) RETURNING id::text AS id`,
    [input.productId, input.imagenUrl],
  );
  const imagenId = imagen!.id;

  if (!input.clasificacion) {
    await query(`UPDATE productos SET estado = 'pendiente_revision', categoria_id = NULL WHERE id = $1`, [
      input.productId,
    ]);
    return { pendingReview: true };
  }

  const categoriaSugerida = await resolverCategoriaFinal(
    input.clasificacion.resultado.categoria,
    producto.departamento_id,
  );
  const { REVIEW_POLICY, REVIEW_THRESHOLD } = getServerEnv();
  const puedePublicarDirecto =
    REVIEW_POLICY === "umbral" &&
    input.clasificacion.resultado.confianza >= REVIEW_THRESHOLD &&
    categoriaSugerida !== null;

  if (input.clasificacion.modo === "real") {
    await persistirPrediccionesYEmbeddings(input.productId, imagenId, input.clasificacion);
  }

  if (puedePublicarDirecto) {
    await query(`UPDATE productos SET categoria_id = $2, estado = 'publicado' WHERE id = $1`, [
      input.productId,
      categoriaSugerida!.id,
    ]);
  } else {
    await query(`UPDATE productos SET estado = 'pendiente_revision', categoria_id = NULL WHERE id = $1`, [
      input.productId,
    ]);
  }
  return { pendingReview: !puedePublicarDirecto };
}

// --- Cambios de estado desde el panel -------------------------------------
// Nunca se borra un producto con DELETE: los pedidos antiguos lo necesitan
// (pedido_items lo referencia con ON DELETE RESTRICT). "Eliminar" es
// archivar: sale de la tienda y de las listas, y se puede restaurar.
export type AccionEstado = "pausar" | "reactivar" | "archivar" | "restaurar";

const TRANSICIONES: Record<AccionEstado, { desde: string; hacia: string }> = {
  // Fuera de la tienda por un tiempo (sin stock, temporada, error en la ficha).
  pausar: { desde: `estado = 'publicado'`, hacia: `'pausado'` },
  reactivar: { desde: `estado = 'pausado'`, hacia: `'publicado'` },
  archivar: { desde: `estado <> 'archivado'`, hacia: `'archivado'` },
  // Vuelve pausado si ya tenía categoría confirmada (el personal decide
  // cuándo reactivarlo); si nunca la tuvo, a revisión.
  restaurar: {
    desde: `estado = 'archivado'`,
    hacia: `(CASE WHEN categoria_id IS NULL THEN 'pendiente_revision' ELSE 'pausado' END)::estado_publicacion`,
  },
};

export async function cambiarEstadoProducto(
  id: string,
  accion: AccionEstado,
): Promise<ProductStatus | null> {
  const { desde, hacia } = TRANSICIONES[accion];
  const row = await queryOne<{ estado: ProductStatus }>(
    `UPDATE productos SET estado = ${hacia}
      WHERE id = $1 AND ${desde}
      RETURNING estado`,
    [id],
  );
  return row?.estado ?? null;
}

// --- Eliminación definitiva -----------------------------------------------
// Regla de un e-commerce: lo que NUNCA se vendió se puede borrar de verdad
// (fichas mal cargadas, pruebas); lo que ya se vendió solo se archiva,
// porque sus pedidos lo referencian (pedido_items, ON DELETE RESTRICT —
// la base lo impide aunque alguien se salte el panel).
//
// ADMIN puede eliminar cualquier producto sin ventas. CATALOGO solo los que
// nunca estuvieron a la venta (en revisión o rechazados): corrige sus
// propios errores de carga, pero no retira productos del catálogo.
//
// Al borrarlo se van también, en cascada, sus fotos, predicciones de IA,
// revisiones, embeddings y pares de duplicados.
export const ESTADOS_ELIMINABLES_POR_CATALOGO: readonly ProductStatus[] = ["pendiente_revision", "rechazado"];

export type EliminarProductoResultado =
  | { ok: true; nombre: string; imagenesHuerfanas: string[] }
  | { ok: false; motivo: "no_encontrado" | "vendido" | "no_permitido" };

export async function eliminarProductoDefinitivo(
  id: string,
  rol: "ADMIN" | "CATALOGO",
): Promise<EliminarProductoResultado> {
  const producto = await queryOne<{ nombre: string; estado: ProductStatus; vendido: boolean }>(
    `SELECT nombre, estado,
            EXISTS (SELECT 1 FROM pedido_items WHERE producto_id = p.id) AS vendido
       FROM productos p WHERE id = $1`,
    [id],
  );
  if (!producto) return { ok: false, motivo: "no_encontrado" };
  if (producto.vendido) return { ok: false, motivo: "vendido" };
  if (rol !== "ADMIN" && !ESTADOS_ELIMINABLES_POR_CATALOGO.includes(producto.estado)) {
    return { ok: false, motivo: "no_permitido" };
  }

  const imagenes = await query<{ url: string }>(
    `SELECT url FROM producto_imagenes WHERE producto_id = $1`,
    [id],
  );
  try {
    const borrado = await queryOne<{ id: string }>(
      `DELETE FROM productos WHERE id = $1 RETURNING id::text AS id`,
      [id],
    );
    if (!borrado) return { ok: false, motivo: "no_encontrado" };
  } catch (error) {
    // Se vendió justo entre la comprobación y el DELETE.
    if (isPgError(error, PG_ERROR.FOREIGN_KEY_VIOLATION)) return { ok: false, motivo: "vendido" };
    throw error;
  }

  // Solo las fotos que ya no usa ningún otro producto.
  const huerfanas: string[] = [];
  for (const { url } of imagenes) {
    const enUso = await queryOne<{ usada: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM producto_imagenes WHERE url = $1) AS usada`,
      [url],
    );
    if (!enUso?.usada) huerfanas.push(url);
  }
  return { ok: true, nombre: producto.nombre, imagenesHuerfanas: huerfanas };
}

// --- Alta de producto con clasificación de IA ------------------------------
//
// Se usa desde app/admin/(protected)/productos/actions.ts, después de subir
// la foto (lib/storage.ts) y de intentar clasificar con el microservicio de
// IA (lib/ai-client.ts). `clasificacion` puede ser null (el servicio no
// respondió) — nunca bloquea el alta, solo decide si hay predicción o no.
export interface CreateProductFromAIInput {
  // Proveedor al que se le compra (opcional): no decide si se vende.
  proveedorId?: string;
  nombre: string;
  descripcion: string;
  marca: string;
  departamento: Departamento;
  // Categoría elegida a mano por el personal (línea base del problema, T1
  // sección 1.2.1) — se guarda en productos.categoria_manual_id, nunca se
  // usa como categoría final: esa la sugiere la IA y se confirma en revisión.
  categoriaManualNombre: string;
  precio: number;
  stock: number;
  imagenUrl: string;
  clasificacion: ClasificarResponse | null;
}

export interface CreateProductFromAIResult {
  product: Product | null; // null si quedó pendiente de revisión
  pendingReview: boolean;
  productId: string;
}

export async function createProductFromAI(
  input: CreateProductFromAIInput,
): Promise<CreateProductFromAIResult> {
  const marcaId = await upsertMarca(input.marca);
  const departamentoId = await getDepartamentoId(input.departamento);

  const categoriaManual = await queryOne<{ id: number }>(
    `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
    [input.categoriaManualNombre, departamentoId],
  );
  if (!categoriaManual) {
    throw new Error(
      `La categoría "${input.categoriaManualNombre}" no pertenece al departamento ${input.departamento}.`,
    );
  }

  const producto = await queryOne<{ id: string }>(
    `INSERT INTO productos (proveedor_id, nombre, descripcion, marca_id, departamento_id, categoria_manual_id, precio, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text AS id`,
    [
      input.proveedorId ?? null,
      input.nombre,
      input.descripcion,
      marcaId,
      departamentoId,
      categoriaManual.id,
      input.precio,
      input.stock,
    ],
  );
  const productoId = producto!.id;

  const imagen = await queryOne<{ id: string }>(
    `INSERT INTO producto_imagenes (producto_id, url, es_principal) VALUES ($1, $2, true) RETURNING id::text AS id`,
    [productoId, input.imagenUrl],
  );
  const imagenId = imagen!.id;

  if (!input.clasificacion) {
    // Sin predicción: queda en revisión manual sin categoría final — el
    // analista la asigna a mano desde /admin/revision.
    return { product: null, pendingReview: true, productId: productoId };
  }

  const categoriaSugerida = await resolverCategoriaFinal(
    input.clasificacion.resultado.categoria,
    departamentoId,
  );

  const { REVIEW_POLICY, REVIEW_THRESHOLD } = getServerEnv();
  const confianzaAlcanzaUmbral = input.clasificacion.resultado.confianza >= REVIEW_THRESHOLD;
  const puedePublicarDirecto =
    REVIEW_POLICY === "umbral" && confianzaAlcanzaUmbral && categoriaSugerida !== null;

  if (input.clasificacion.modo === "real") {
    await persistirPrediccionesYEmbeddings(productoId, imagenId, input.clasificacion);
  }

  if (puedePublicarDirecto) {
    await query(`UPDATE productos SET categoria_id = $2, estado = 'publicado' WHERE id = $1`, [
      productoId,
      categoriaSugerida!.id,
    ]);
  }

  return {
    product: puedePublicarDirecto ? await getProductById(productoId) : null,
    pendingReview: !puedePublicarDirecto,
    productId: productoId,
  };
}

// La categoría que sugiere la IA no siempre pertenece al departamento que
// eligió el personal (el modelo clasifica entre las 21 sin esa
// restricción) — productos.categoria_id SÍ la exige (fk_productos_categoria_depto).
// Si no coincide, se devuelve null: el producto queda en revisión igual,
// nunca se intenta publicar con una categoría de otro departamento.
async function resolverCategoriaFinal(
  categoriaNombre: string,
  departamentoId: number,
): Promise<{ id: number } | null> {
  return queryOne<{ id: number }>(
    `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
    [categoriaNombre, departamentoId],
  );
}

async function persistirPrediccionesYEmbeddings(
  productoId: string,
  imagenId: string,
  clasificacion: ClasificarResponse,
): Promise<void> {
  for (const prediccion of clasificacion.por_modelo) {
    const modelo = await queryOne<{ id: number }>(
      `SELECT id FROM modelos_ia WHERE codigo = $1`,
      [prediccion.codigo_modelo],
    );
    if (!modelo) continue; // modelo desconocido (no sembrado en modelos_ia) — se omite, no se inventa el id

    const categoria = await queryOne<{ id: number }>(
      `SELECT id FROM categorias WHERE nombre = $1`,
      [prediccion.categoria],
    );
    if (!categoria) continue;

    await query(
      `INSERT INTO predicciones_ia
         (producto_id, modelo_id, imagen_id, categoria_predicha_id, confianza, top_k, latencia_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        productoId,
        modelo.id,
        prediccion.tipo === "imagen" ? imagenId : null,
        categoria.id,
        prediccion.confianza,
        JSON.stringify(
          prediccion.top_k.map((t) => ({ categoria_id: null, categoria: t.categoria, prob: t.prob })),
        ),
        clasificacion.latencia_ms,
      ],
    );
  }

  for (const embedding of clasificacion.embeddings) {
    const modelo = await queryOne<{ id: number }>(
      `SELECT id FROM modelos_ia WHERE codigo = $1`,
      [embedding.codigo_modelo],
    );
    if (!modelo) continue;

    await query(
      `INSERT INTO producto_embeddings (producto_id, modelo_id, fuente, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (producto_id, modelo_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [productoId, modelo.id, embedding.fuente, JSON.stringify(embedding.vector)],
    );
  }
}

// --- CU5: detección de duplicados a partir de los embeddings guardados ----
export interface DuplicadoDetectado {
  productoId: string;
  similitud: number;
}

// Corre fn_buscar_duplicados (similitud coseno, pgvector) por cada modelo
// con el que el producto tenga embedding, y guarda los pares por encima del
// umbral en duplicados_detectados para que /admin/duplicados los revise.
// Se llama después de persistirPrediccionesYEmbeddings — nunca en modo demo
// (no hay embeddings guardados, ver persistirPrediccionesYEmbeddings).
export async function detectarYRegistrarDuplicados(
  productoId: string,
  umbral = 0.9,
): Promise<DuplicadoDetectado[]> {
  const modelosConEmbedding = await query<{ modelo_id: number; tipo: string }>(
    `SELECT pe.modelo_id, m.tipo
       FROM producto_embeddings pe
       JOIN modelos_ia m ON m.id = pe.modelo_id
      WHERE pe.producto_id = $1`,
    [productoId],
  );

  const porVecino = new Map<string, { imagen?: number; texto?: number }>();
  for (const { modelo_id, tipo } of modelosConEmbedding) {
    const vecinos = await query<{ producto_id: string; similitud: number }>(
      `SELECT producto_id::text, similitud FROM fn_buscar_duplicados($1, $2, $3, 5)`,
      [productoId, modelo_id, umbral],
    );
    for (const vecino of vecinos) {
      const entrada = porVecino.get(vecino.producto_id) ?? {};
      if (tipo === "imagen") entrada.imagen = vecino.similitud;
      else entrada.texto = vecino.similitud;
      porVecino.set(vecino.producto_id, entrada);
    }
  }

  const detectados: DuplicadoDetectado[] = [];
  for (const [vecinoId, sims] of porVecino) {
    const componentes = [sims.imagen, sims.texto].filter(
      (v): v is number => v !== undefined,
    );
    const combinada = componentes.reduce((a, b) => a + b, 0) / componentes.length;

    const [a, b] =
      BigInt(productoId) < BigInt(vecinoId)
        ? [productoId, vecinoId]
        : [vecinoId, productoId];

    await query(
      `INSERT INTO duplicados_detectados
         (producto_a_id, producto_b_id, similitud_texto, similitud_imagen, similitud_combinada, umbral_usado)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (producto_a_id, producto_b_id) DO NOTHING`,
      [a, b, sims.texto ?? null, sims.imagen ?? null, combinada, umbral],
    );
    detectados.push({ productoId: vecinoId, similitud: combinada });
  }

  return detectados;
}

// --- Revisión de clasificaciones de IA con baja confianza -----------------
export interface PendingReviewEntry {
  product: Product;
  confidence: number;
  creadoEn: string;
}

interface PendingRow extends ProductRow {
  creado_en: Date;
  departamento_id: number;
  prediccion_id: number | null;
  categoria_sugerida_id: number | null;
  confianza: number | null;
}

const SELECT_PENDIENTES = `
  SELECT
    p.id::text                                           AS id,
    p.nombre,
    p.precio::float8                                      AS precio,
    p.stock,
    m.nombre::text                                        AS marca,
    d.nombre                                               AS departamento,
    img.url                                                AS imagen_url,
    COALESCE(cat_pred.nombre, 'Sin categoría sugerida')    AS categoria_ia,
    p.precio_original::float8                              AS "precioOriginal",
    p.rating_promedio::float8                              AS rating,
    p.num_resenas                                          AS "numResenas",
    p.envio_gratis                                         AS "envioGratis",
    p.es_nuevo                                             AS "esNuevo",
    p.descripcion,
    p.departamento_id,
    pred.id                                                AS prediccion_id,
    pred.categoria_predicha_id                             AS categoria_sugerida_id,
    pred.confianza::float8                                 AS confianza,
    p.creado_en
  FROM productos p
  JOIN marcas m ON m.id = p.marca_id
  JOIN departamentos d ON d.id = p.departamento_id
  LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
  -- Puede haber una fila de predicciones_ia por modelo (imagen + texto) —
  -- se muestra la de mayor confianza como "la" sugerencia principal (no
  -- hay una fila de "resultado fusionado" en predicciones_ia; el fusionado
  -- vive solo en la respuesta de ai-service, no se vuelve a calcular acá).
  LEFT JOIN LATERAL (
    SELECT * FROM predicciones_ia WHERE producto_id = p.id ORDER BY confianza DESC NULLS LAST LIMIT 1
  ) pred ON true
  LEFT JOIN categorias cat_pred ON cat_pred.id = pred.categoria_predicha_id
  WHERE p.estado = 'pendiente_revision'
`;

function toPendingEntry(row: PendingRow): PendingReviewEntry {
  return {
    product: toProduct(row),
    confidence: row.confianza ?? 0,
    creadoEn: row.creado_en.toISOString(),
  };
}

export async function listPendingReview(): Promise<PendingReviewEntry[]> {
  const rows = await query<PendingRow>(
    `${SELECT_PENDIENTES} ORDER BY p.creado_en`,
  );
  return rows.map(toPendingEntry);
}

export async function approvePendingReview(
  productId: string,
  adminEmail: string,
  categoriaFinalNombre?: string,
  tiempoRevisionSeg?: number,
): Promise<Product | null> {
  const pending = await queryOne<{
    prediccion_id: number | null;
    categoria_sugerida_id: number | null;
    departamento_id: number;
  }>(
    `SELECT pred.id AS prediccion_id, pred.categoria_predicha_id AS categoria_sugerida_id, p.departamento_id
       FROM productos p
       LEFT JOIN LATERAL (
         SELECT * FROM predicciones_ia WHERE producto_id = p.id ORDER BY confianza DESC NULLS LAST LIMIT 1
       ) pred ON true
      WHERE p.id = $1 AND p.estado = 'pendiente_revision'`,
    [productId],
  );
  if (!pending) return null;

  let categoriaFinalId = pending.categoria_sugerida_id;
  let accion: "aceptada" | "corregida" = "aceptada";
  if (categoriaFinalNombre) {
    const categoria = await queryOne<{ id: number }>(
      `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
      [categoriaFinalNombre, pending.departamento_id],
    );
    if (!categoria) {
      throw new Error("Categoría inválida para el departamento de este producto.");
    }
    categoriaFinalId = categoria.id;
    accion = categoriaFinalId === pending.categoria_sugerida_id ? "aceptada" : "corregida";
  }
  if (categoriaFinalId === null) {
    throw new Error("Este producto no tiene una categoría sugerida ni una categoría final.");
  }

  const admin = await queryOne<{ id: string }>(
    `SELECT id::text AS id FROM usuarios WHERE email = $1`,
    [adminEmail],
  );
  if (!admin) throw new Error("No se encontró al administrador que aprueba.");

  await query(
    `INSERT INTO revisiones_categoria
       (producto_id, prediccion_id, categoria_sugerida_id, categoria_final_id, accion, revisado_por, tiempo_revision_seg)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      productId,
      pending.prediccion_id,
      pending.categoria_sugerida_id,
      categoriaFinalId,
      accion,
      admin.id,
      tiempoRevisionSeg ?? null,
    ],
  );
  // El trigger trg_revision_aplicar_categoria ya fija productos.categoria_id;
  // solo falta pasar a publicado (trg_productos_reglas_publicacion fija
  // publicado_en).
  await query(`UPDATE productos SET estado = 'publicado' WHERE id = $1`, [productId]);

  return getProductById(productId);
}

export async function rejectPendingReview(
  productId: string,
  motivo: string,
): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET estado = 'rechazado', motivo_rechazo = $2
      WHERE id = $1 AND estado = 'pendiente_revision'
      RETURNING id::text AS id`,
    [productId, motivo],
  );
  return result !== null;
}

// --- CU5: duplicados detectados por embeddings (la fuente principal) ------
export interface DuplicateProductSummary {
  id: string;
  nombre: string;
  marca: string;
  imagenUrl: string;
}

export interface DetectedDuplicate {
  id: number;
  a: DuplicateProductSummary;
  b: DuplicateProductSummary;
  similitudTexto: number | null;
  similitudImagen: number | null;
  similitudCombinada: number;
  umbralUsado: number;
  estado: "pendiente" | "confirmado" | "descartado";
  creadoEn: string;
}

interface DuplicateRow {
  // bigint: node-postgres lo entrega como texto ("12"), no como número.
  id: string;
  producto_a_id: string;
  producto_b_id: string;
  similitud_texto: number | null;
  similitud_imagen: number | null;
  similitud_combinada: number;
  umbral_usado: number;
  estado: "pendiente" | "confirmado" | "descartado";
  creado_en: Date;
}

async function getProductSummary(id: string): Promise<DuplicateProductSummary | null> {
  // A diferencia de getProductById (v_productos_tienda, solo publicados):
  // un par de duplicados casi siempre involucra un producto recién creado
  // que SIGUE en pendiente_revision — filtrar por "publicado" acá
  // descartaría en silencio justo los casos que importa mostrar.
  const row = await queryOne<{ id: string; nombre: string; marca: string; imagen_url: string | null }>(
    `SELECT p.id::text AS id, p.nombre, m.nombre::text AS marca, img.url AS imagen_url
       FROM productos p
       JOIN marcas m ON m.id = p.marca_id
       LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
      WHERE p.id = $1`,
    [id],
  );
  return row ? { id: row.id, nombre: row.nombre, marca: row.marca, imagenUrl: row.imagen_url ?? "" } : null;
}

export async function listDetectedDuplicates(): Promise<DetectedDuplicate[]> {
  const rows = await query<DuplicateRow>(
    `SELECT id, producto_a_id::text AS producto_a_id, producto_b_id::text AS producto_b_id,
            similitud_texto::float8 AS similitud_texto, similitud_imagen::float8 AS similitud_imagen,
            similitud_combinada::float8 AS similitud_combinada, umbral_usado::float8 AS umbral_usado,
            estado, creado_en
       FROM duplicados_detectados
      ORDER BY (estado = 'pendiente') DESC, creado_en DESC`,
  );

  const resultado: DetectedDuplicate[] = [];
  for (const row of rows) {
    const [a, b] = await Promise.all([
      getProductSummary(row.producto_a_id),
      getProductSummary(row.producto_b_id),
    ]);
    if (!a || !b) continue; // alguno de los dos se borró de verdad (no pasa con el borrado lógico, pero por si acaso)
    resultado.push({
      // A número: resolveDuplicateAction lo valida con z.number() y, si
      // llegaba "12" (texto), los dos botones fallaban con "Datos inválidos".
      id: Number(row.id),
      a,
      b,
      similitudTexto: row.similitud_texto,
      similitudImagen: row.similitud_imagen,
      similitudCombinada: row.similitud_combinada,
      umbralUsado: row.umbral_usado,
      estado: row.estado,
      creadoEn: row.creado_en.toISOString(),
    });
  }
  return resultado;
}

export interface ResolveDuplicateResult {
  ok: boolean;
  // Al confirmar un duplicado se archiva la copia más nueva (la de id
  // mayor: producto_b_id, por ck_duplicado_orden), para no vender lo mismo
  // dos veces. null si no se archivó nada.
  archivado: { id: string; nombre: string } | null;
}

export async function resolveDuplicate(
  id: number,
  estado: "confirmado" | "descartado",
  adminEmail: string,
): Promise<ResolveDuplicateResult> {
  const admin = await queryOne<{ id: string }>(`SELECT id::text AS id FROM usuarios WHERE email = $1`, [adminEmail]);
  if (!admin) throw new Error("No se encontró al administrador.");

  const result = await queryOne<{ producto_b_id: string }>(
    `UPDATE duplicados_detectados
        SET estado = $2, revisado_por = $3, revisado_en = now()
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING producto_b_id::text AS producto_b_id`,
    [id, estado, admin.id],
  );
  if (!result) return { ok: false, archivado: null };
  if (estado === "descartado") return { ok: true, archivado: null };

  const archivado = await queryOne<{ id: string; nombre: string }>(
    `UPDATE productos SET estado = 'archivado'
      WHERE id = $1 AND estado <> 'archivado'
      RETURNING id::text AS id, nombre`,
    [result.producto_b_id],
  );
  return { ok: true, archivado };
}

// --- Respaldo sin IA: similitud de texto (Levenshtein) ---------------------
export interface DuplicatePair {
  a: Product;
  b: Product;
  score: number;
}

// Solo se usa si un producto no tiene ningún embedding guardado todavía
// (servicio de IA en modo demo, o nunca se corrió la detección) — ver
// components/admin/DuplicatesList.tsx, que lo etiqueta explícitamente como
// "sin IA" para no confundirlo con los pares de listDetectedDuplicates.
export async function listPossibleDuplicates(
  threshold = 0.82,
): Promise<DuplicatePair[]> {
  const products = await listProducts();
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];
      if (a.marca.toLowerCase() !== b.marca.toLowerCase()) continue;
      const score = similarity(a.nombre, b.nombre);
      if (score >= threshold) pairs.push({ a, b, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
