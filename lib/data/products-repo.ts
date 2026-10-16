import "server-only";
import { query, queryOne } from "@/lib/db";
import { getServerEnv } from "@/lib/env.server";
import type { ClasificarResponse } from "@/lib/ai-client";
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

// v_productos_tienda no trae categoria_vendedor_id (no es parte del
// contrato público de Product) — EditProductForm lo necesita para
// preseleccionar el <select> de categoría del vendedor.
export async function getCategoriaVendedorNombre(productId: string): Promise<string | null> {
  const row = await queryOne<{ nombre: string | null }>(
    `SELECT c.nombre
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_vendedor_id
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
  descripcion?: string;
  precio?: number;
  stock?: number;
  marca?: string;
  departamento?: Departamento;
  // Solo tiene efecto si `departamento` también viene en el mismo patch
  // (el formulario de edición siempre manda los dos juntos) — necesita
  // resolverse dentro de ese departamento por fk_productos_categoria_depto.
  categoriaVendedor?: string;
}

// Usado por EditProductForm (vía Server Action): no toca la categoría
// FINAL ni la imagen — eso pasa por reclassifyProduct cuando se reemplaza
// la foto. Solo devuelve el producto si sigue publicado: v_productos_tienda
// no muestra productos pendientes/inactivos.
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
  if (patch.categoriaVendedor !== undefined && departamentoId !== undefined) {
    const categoria = await queryOne<{ id: number }>(
      `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
      [patch.categoriaVendedor, departamentoId],
    );
    if (!categoria) {
      throw new Error(`La categoría "${patch.categoriaVendedor}" no pertenece al departamento ${patch.departamento}.`);
    }
    params.push(categoria.id);
    sets.push(`categoria_vendedor_id = $${params.length}`);
  }

  if (sets.length === 0) return getProductById(id);

  params.push(id);
  const result = await queryOne<{ id: string }>(
    `UPDATE productos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id::text AS id`,
    params,
  );
  return result ? getProductById(result.id) : null;
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
// Se usa desde app/admin/(protected)/productos/actions.ts, después de subir
// la foto (lib/storage.ts) y de intentar clasificar con el microservicio de
// IA (lib/ai-client.ts). `clasificacion` puede ser null (el servicio no
// respondió) — nunca bloquea el alta, solo decide si hay predicción o no.
export interface CreateProductFromAIInput {
  // Si se omite (caso ADMIN, que no es vendedor), se resuelve buscando qué
  // vendedor aprobado ya tiene productos con esta marca — ver el aviso en
  // getVendedorIdByEmail sobre por qué nombre_comercial no sirve para esto
  // ("SoundMax Perú" como tienda, "SoundMax" como marca de sus productos).
  vendedorId?: string;
  nombre: string;
  descripcion: string;
  marca: string;
  departamento: Departamento;
  // Categoría elegida a mano por el vendedor (línea base del problema, T1
  // sección 1.2.1) — se guarda en productos.categoria_vendedor_id, nunca se
  // usa como categoría final.
  categoriaVendedorNombre: string;
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

  const categoriaVendedor = await queryOne<{ id: number }>(
    `SELECT id FROM categorias WHERE nombre = $1 AND departamento_id = $2`,
    [input.categoriaVendedorNombre, departamentoId],
  );
  if (!categoriaVendedor) {
    throw new Error(
      `La categoría "${input.categoriaVendedorNombre}" no pertenece al departamento ${input.departamento}.`,
    );
  }

  const producto = await queryOne<{ id: string }>(
    `INSERT INTO productos (vendedor_id, nombre, descripcion, marca_id, departamento_id, categoria_vendedor_id, precio, stock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text AS id`,
    [
      vendedor.id,
      input.nombre,
      input.descripcion,
      marcaId,
      departamentoId,
      categoriaVendedor.id,
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
// eligió el vendedor (el modelo clasifica entre las 21 sin esa
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
  id: number;
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
      id: row.id,
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

export async function resolveDuplicate(
  id: number,
  estado: "confirmado" | "descartado",
  adminEmail: string,
): Promise<boolean> {
  const admin = await queryOne<{ id: string }>(`SELECT id::text AS id FROM usuarios WHERE email = $1`, [adminEmail]);
  if (!admin) throw new Error("No se encontró al administrador.");

  const result = await queryOne<{ id: number }>(
    `UPDATE duplicados_detectados
        SET estado = $2, revisado_por = $3, revisado_en = now()
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING id`,
    [id, estado, admin.id],
  );
  return result !== null;
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
