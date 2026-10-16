import "server-only";
import { query, queryOne } from "@/lib/db";
import type { Product, Departamento } from "@/types";
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

export async function getProductById(id: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE id = $1`,
    [id],
  );
  return row ? toProduct(row) : null;
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

// Usado para el catálogo de /admin/productos de un SELLER: filtra por
// vendedor_id (identidad real de su sesión), no por el texto de `marca`
// —que puede diferir del nombre comercial de su tienda (ver
// isProductOwnedByVendedor).
export async function listByVendedor(vendedorId: string): Promise<Product[]> {
  const rows = await query<ProductRow>(
    `SELECT * FROM v_productos_tienda WHERE vendedor_id = $1 ORDER BY id::bigint`,
    [vendedorId],
  );
  return rows.map(toProduct);
}

// El `Product` público no trae vendedor_id (no es parte del contrato del
// frontend); esto es lo que usan las Server Actions de editar/eliminar para
// comprobar que un SELLER es realmente el dueño del producto, en vez de
// comparar por nombre de marca (que no identifica al vendedor de forma
// confiable — ver createProductFromAI).
export async function isProductOwnedByVendedor(
  productId: string,
  vendedorId: string,
): Promise<boolean> {
  const row = await queryOne<{ owned: boolean }>(
    `SELECT (vendedor_id = $2) AS owned FROM productos WHERE id = $1`,
    [productId, vendedorId],
  );
  return row?.owned ?? false;
}

// true si `marca` ya tiene productos publicados a nombre de OTRO vendedor:
// evita que un vendedor use el nombre de una marca ajena para su propio
// producto (el dueño real de vendedorId sale de la sesión, no de este texto
// — ver createProductFromAI — pero el texto de la marca sigue siendo libre,
// así que esto es lo único que impide suplantar una marca existente).
export async function isMarcaOwnedByOtherVendedor(
  marca: string,
  vendedorId: string,
): Promise<boolean> {
  const row = await queryOne<{ owned: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM productos p
       JOIN marcas m ON m.id = p.marca_id
       WHERE m.nombre = $1 AND p.vendedor_id <> $2
     ) AS owned`,
    [marca, vendedorId],
  );
  return row?.owned ?? false;
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
  precio?: number;
  stock?: number;
  marca?: string;
  departamento?: Departamento;
}

// Usado por EditProductForm (vía Server Action): no toca categoría ni
// imagen — esas dependen de un paso de IA que, si existe, va por
// createProductFromAI. Solo devuelve el producto si sigue publicado:
// v_productos_tienda no muestra productos pendientes/inactivos.
export async function updateProductRecord(
  id: string,
  patch: ProductPatch,
): Promise<Product | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.nombre !== undefined) {
    params.push(patch.nombre);
    sets.push(`nombre = $${params.length}`);
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
  if (patch.departamento !== undefined) {
    const departamentoId = await getDepartamentoId(patch.departamento);
    params.push(departamentoId);
    sets.push(`departamento_id = $${params.length}`);
  }

  if (sets.length === 0) return getProductById(id);

  params.push(id);
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id::text AS id`,
    params,
  );
  return result ? getProductById(result.id) : null;
}

// Borrado lógico: pasa a 'inactivo' en vez de DELETE (la FK de pedido_items
// con ON DELETE RESTRICT lo impediría de todos modos si el producto ya se
// vendió alguna vez, y 'inactivo' es justamente el estado que el esquema
// define para esto).
export async function removeProduct(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET estado = 'inactivo'
      WHERE id = $1 AND estado = 'publicado'
      RETURNING id::text AS id`,
    [id],
  );
  return result !== null;
}

// --- Alta de producto con clasificación de IA ------------------------------
//
// Se usa desde app/admin/(protected)/productos/actions.ts una vez que el
// backend de IA (lib/api.ts, externo a este repo) responde con la categoría
// y la confianza. El producto entra con estado 'pendiente_revision' por
// defecto; si la confianza supera REVIEW_THRESHOLD se publica de inmediato,
// igual que antes de conectar la base.
export const REVIEW_THRESHOLD = 0.75;

export interface CreateProductFromAIInput {
  // Si se omite (caso ADMIN, que no es vendedor), se resuelve buscando qué
  // vendedor aprobado ya tiene productos con esta marca — ver el aviso en
  // getVendedorIdByEmail sobre por qué nombre_comercial no sirve para esto
  // ("SoundMax Perú" como tienda, "SoundMax" como marca de sus productos).
  vendedorId?: string;
  nombre: string;
  descripcion?: string;
  marca: string;
  departamento: Departamento;
  precio: number;
  stock: number;
  imagenUrl: string;
  categoriaPredichaNombre: string;
  confianza: number;
}

export interface CreateProductFromAIResult {
  product: Product | null; // null si quedó pendiente de revisión
  pendingReview: boolean;
}

export async function createProductFromAI(
  input: CreateProductFromAIInput,
): Promise<CreateProductFromAIResult> {
  const vendedor = input.vendedorId
    ? { id: input.vendedorId }
    : await queryOne<{ id: string }>(
        `SELECT DISTINCT v.id::text AS id
           FROM vendedores v
           JOIN productos p ON p.vendedor_id = v.id
           JOIN marcas m ON m.id = p.marca_id
          WHERE m.nombre = $1 AND v.estado = 'aprobado'
          LIMIT 1`,
        [input.marca],
      );
  if (!vendedor) {
    throw new Error(
      `No hay un vendedor aprobado para la marca "${input.marca}". Un administrador debe darla de alta en /admin/vendedores.`,
    );
  }

  const marcaId = await upsertMarca(input.marca);
  const departamentoId = await getDepartamentoId(input.departamento);

  const categoria = await queryOne<{ id: number }>(
    `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
    [input.categoriaPredichaNombre, departamentoId],
  );
  if (!categoria) {
    throw new Error(
      `La categoría sugerida por la IA ("${input.categoriaPredichaNombre}") no pertenece al departamento ${input.departamento}.`,
    );
  }

  // cu1-resnet50-v1: modelo de imagen sembrado por el script de la base.
  // Cuando exista el servicio real de clasificación, que informe qué
  // modelo usó en vez de asumirlo aquí.
  const modelo = await queryOne<{ id: number }>(
    `SELECT id FROM modelos_ia WHERE codigo = 'cu1-resnet50-v1'`,
  );
  if (!modelo) {
    throw new Error("No hay ningún modelo de IA registrado en modelos_ia.");
  }

  const producto = await queryOne<{ id: string }>(
    `INSERT INTO productos (vendedor_id, nombre, descripcion, marca_id, departamento_id, precio, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text AS id`,
    [
      vendedor.id,
      input.nombre,
      input.descripcion ?? null,
      marcaId,
      departamentoId,
      input.precio,
      input.stock,
    ],
  );
  const productoId = producto!.id;

  await query(
    `INSERT INTO producto_imagenes (producto_id, url, es_principal) VALUES ($1, $2, true)`,
    [productoId, input.imagenUrl],
  );

  await query(
    `INSERT INTO predicciones_ia (producto_id, modelo_id, categoria_predicha_id, confianza)
     VALUES ($1, $2, $3, $4)`,
    [productoId, modelo.id, categoria.id, input.confianza],
  );

  const pendingReview = input.confianza < REVIEW_THRESHOLD;
  if (!pendingReview) {
    await query(
      `UPDATE productos SET categoria_id = $2, estado = 'publicado' WHERE id = $1`,
      [productoId, categoria.id],
    );
  }

  return {
    product: pendingReview ? null : await getProductById(productoId),
    pendingReview,
  };
}

// --- Revisión de clasificaciones de IA con baja confianza -----------------
export interface PendingReviewEntry {
  product: Product;
  aiAccuracy: number;
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
  LEFT JOIN LATERAL (
    SELECT * FROM predicciones_ia WHERE producto_id = p.id ORDER BY creado_en DESC LIMIT 1
  ) pred ON true
  LEFT JOIN categorias cat_pred ON cat_pred.id = pred.categoria_predicha_id
  WHERE p.estado = 'pendiente_revision'
`;

function toPendingEntry(row: PendingRow): PendingReviewEntry {
  return {
    product: toProduct(row),
    aiAccuracy: row.confianza ?? 0,
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
): Promise<Product | null> {
  const pending = await queryOne<{
    prediccion_id: number | null;
    categoria_sugerida_id: number | null;
    departamento_id: number;
  }>(
    `SELECT pred.id AS prediccion_id, pred.categoria_predicha_id AS categoria_sugerida_id, p.departamento_id
       FROM productos p
       LEFT JOIN LATERAL (
         SELECT * FROM predicciones_ia WHERE producto_id = p.id ORDER BY creado_en DESC LIMIT 1
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
       (producto_id, prediccion_id, categoria_sugerida_id, categoria_final_id, accion, revisado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      productId,
      pending.prediccion_id,
      pending.categoria_sugerida_id,
      categoriaFinalId,
      accion,
      admin.id,
    ],
  );
  // El trigger trg_revision_aplicar_categoria ya fija productos.categoria_id;
  // solo falta pasar a publicado (trg_productos_reglas_publicacion valida
  // que el vendedor esté aprobado y fija publicado_en).
  await query(`UPDATE productos SET estado = 'publicado' WHERE id = $1`, [productId]);

  return getProductById(productId);
}

export async function rejectPendingReview(
  productId: string,
  motivo = "Rechazado desde el panel de revisión de IA",
): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET estado = 'rechazado', motivo_rechazo = $2
      WHERE id = $1 AND estado = 'pendiente_revision'
      RETURNING id::text AS id`,
    [productId, motivo],
  );
  return result !== null;
}

// --- Detección de posibles duplicados --------------------------------------
export interface DuplicatePair {
  a: Product;
  b: Product;
  score: number;
}

// Compara por similitud de texto (Levenshtein normalizado, lib/similarity.ts)
// sobre el catálogo publicado. El esquema trae su propia detección por
// embeddings (fn_buscar_duplicados, CU5), pero requiere un modelo de IA
// entrenado que todavía no existe; esto es la versión sin IA, ya en uso.
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
