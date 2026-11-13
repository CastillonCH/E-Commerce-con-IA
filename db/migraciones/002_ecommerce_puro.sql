-- =============================================================================
--  002_ecommerce_puro.sql
--
--  NovaStore deja de ser un marketplace y pasa a ser un e-commerce puro:
--  NovaStore vende todo con su propio personal.
--
--  Qué cambia:
--    · vendedores (tiendas con login)  →  proveedores (solo datos, sin login).
--      Los productos guardan a qué proveedor se le compran (opcional).
--    · rol SELLER  →  rol CATALOGO (personal interno que gestiona productos).
--      Las cuentas de las antiguas tiendas se eliminan (o pasan a CLIENT si
--      tienen pedidos), y catalogo@novastore.pe pasa a ser CATALOGO.
--    · Estados del producto: 'inactivo' pasa a llamarse 'archivado' y se
--      agrega 'pausado' (fuera de la tienda por un tiempo, se puede reactivar).
--    · productos.categoria_vendedor_id  →  categoria_manual_id (la categoría
--      que elige a mano el personal: línea base frente a la IA).
--    · pedido_items ya no guarda vendedor.
--
--  Para quién: cualquier base que ya tenga aplicado el script v2.0
--  (db/novastore_postgresql.sql anterior a este cambio). Una base creada
--  desde cero con el script actual ya viene así y NO necesita esta migración.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/002_ecommerce_puro.sql
--    (o en pgAdmin: abrir en el Query Tool y ejecutar completo).
--
--  Es todo-o-nada: corre en una sola transacción. Si algo falla, la base
--  queda exactamente como estaba. Si ya se aplicó, se detiene sin tocar nada.
--  Recomendado: sacar un respaldo antes (pg_dump -Fc).
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

-- 0. ¿Ya se aplicó? --------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('novastore.vendedores') IS NULL THEN
        RAISE EXCEPTION 'La migración 002 ya está aplicada (no existe la tabla vendedores). No se cambió nada.';
    END IF;
END $$;

-- 1. Proveedores: a quién le compra NovaStore la mercadería ------------------
CREATE TABLE proveedores (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          varchar(120)  NOT NULL UNIQUE CHECK (length(btrim(nombre)) >= 2),
    razon_social    varchar(160),
    ruc             char(11)      UNIQUE CHECK (ruc ~ '^(10|15|17|20)[0-9]{9}$'),
    email_contacto  citext,
    telefono        varchar(20),
    activo          boolean       NOT NULL DEFAULT true,
    creado_en       timestamptz   NOT NULL DEFAULT now(),
    actualizado_en  timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON TABLE proveedores IS 'Empresas a las que NovaStore compra la mercadería. Son solo datos: no inician sesión.';
CREATE TRIGGER trg_proveedores_actualizado
    BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Se conservan las tiendas reales (las que tienen productos o no son cuentas
-- de prueba @example.com); mismo id, así los productos se reasignan directo.
INSERT INTO proveedores (id, nombre, razon_social, ruc, email_contacto, telefono, activo, creado_en)
SELECT v.id, v.nombre_comercial, v.razon_social, v.ruc,
       coalesce(v.email_contacto, u.email), v.telefono,
       v.estado = 'aprobado', v.creado_en
  FROM vendedores v
  JOIN usuarios u ON u.id = v.usuario_id
 WHERE EXISTS (SELECT 1 FROM productos p WHERE p.vendedor_id = v.id)
    OR u.email::text NOT LIKE '%@example.com';

ALTER TABLE productos
    ADD COLUMN proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL;
UPDATE productos p
   SET proveedor_id = p.vendedor_id
 WHERE EXISTS (SELECT 1 FROM proveedores pr WHERE pr.id = p.vendedor_id);
COMMENT ON COLUMN productos.proveedor_id IS 'Proveedor al que se le compra (opcional). No afecta si el producto se vende.';

-- 2. Funciones que dependían del vendedor ---------------------------------
CREATE OR REPLACE FUNCTION fn_productos_reglas_publicacion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'publicado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'publicado') THEN
        NEW.publicado_en := coalesce(NEW.publicado_en, now());
    END IF;
    IF NEW.estado = 'rechazado' AND NEW.motivo_rechazo IS NULL THEN
        RAISE EXCEPTION 'Indique motivo_rechazo al rechazar un producto'
            USING ERRCODE = 'check_violation';
    END IF;
    -- El motivo solo tiene sentido mientras está rechazado.
    IF NEW.estado <> 'rechazado' THEN
        NEW.motivo_rechazo := NULL;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_pedido_items_antes()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    p productos%ROWTYPE;
BEGIN
    SELECT * INTO p FROM productos WHERE id = NEW.producto_id FOR UPDATE;
    IF NOT FOUND OR p.estado <> 'publicado' THEN
        RAISE EXCEPTION 'El producto % no está disponible', NEW.producto_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF p.stock < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para "%": quedan %, se pidieron %',
            p.nombre, p.stock, NEW.cantidad
            USING ERRCODE = 'check_violation';
    END IF;
    NEW.nombre_producto := p.nombre;
    NEW.precio_unitario := p.precio;
    NEW.imagen_url      := coalesce(NEW.imagen_url,
                           (SELECT url FROM producto_imagenes
                             WHERE producto_id = p.id AND es_principal LIMIT 1));
    UPDATE productos SET stock = stock - NEW.cantidad WHERE id = p.id;
    RETURN NEW;
END $$;

-- 3. Vistas que se rehacen (se crean de nuevo al final) -------------------
DROP VIEW v_productos_tienda;
DROP VIEW v_admin_vendedores;
DROP VIEW v_dashboard_kpis;
DROP VIEW v_linea_base_categorizacion;
DROP VIEW v_dataset_entrenamiento;

-- 4. Fuera el vendedor de productos y pedidos -----------------------------
ALTER TABLE pedido_items DROP COLUMN vendedor_id;          -- y su índice
ALTER TABLE productos    DROP COLUMN vendedor_id;          -- y su FK, índice y UNIQUE (vendedor_id, sku)
ALTER TABLE productos    ADD CONSTRAINT uq_productos_sku UNIQUE (sku);
CREATE INDEX ix_productos_proveedor ON productos (proveedor_id);

ALTER TABLE productos RENAME COLUMN categoria_vendedor_id TO categoria_manual_id;
ALTER TABLE productos RENAME CONSTRAINT productos_categoria_vendedor_id_fkey TO productos_categoria_manual_id_fkey;
COMMENT ON COLUMN productos.categoria_manual_id IS 'Categoría que eligió a mano el personal al cargar el producto (línea base frente a la IA).';

DROP TABLE vendedores;                 -- arrastra sus triggers
DROP FUNCTION fn_vendedor_sync_rol();
DROP TYPE estado_vendedor;

-- 5. Roles: SELLER → CATALOGO ---------------------------------------------
-- Las cuentas de las antiguas tiendas ya no sirven. Se borran, salvo que
-- tengan pedidos como compradores: esas quedan como clientes.
DELETE FROM usuarios u
 WHERE u.rol = 'SELLER'
   AND NOT EXISTS (SELECT 1 FROM pedidos pe WHERE pe.cliente_id = u.id);
UPDATE usuarios SET rol = 'CLIENT' WHERE rol = 'SELLER';

ALTER TYPE rol_usuario RENAME VALUE 'SELLER' TO 'CATALOGO';
UPDATE usuarios SET rol = 'CATALOGO' WHERE email = 'catalogo@novastore.pe' AND rol = 'ADMIN';
COMMENT ON TABLE usuarios IS 'Clientes y personal de NovaStore (ADMIN, CATALOGO). El rol se asigna en el backend, nunca desde el cliente.';

-- 6. Estados del producto -------------------------------------------------
ALTER TYPE estado_publicacion RENAME VALUE 'inactivo' TO 'archivado';
ALTER TYPE estado_publicacion ADD VALUE 'pausado' BEFORE 'archivado';
-- (PostgreSQL no deja usar 'pausado' dentro de esta misma transacción: por
-- eso las vistas de abajo no lo nombran.)

-- 7. Vistas ---------------------------------------------------------------
CREATE VIEW v_productos_tienda AS
SELECT p.id::text                    AS id,
       p.nombre,
       p.precio::float8              AS precio,
       p.stock,
       m.nombre::text                AS marca,
       d.nombre                      AS departamento,
       img.url                       AS imagen_url,
       c.nombre                      AS categoria_ia,
       p.precio_original::float8     AS "precioOriginal",
       p.rating_promedio::float8     AS rating,
       p.num_resenas                 AS "numResenas",
       p.envio_gratis                AS "envioGratis",
       p.es_nuevo                    AS "esNuevo",
       p.descripcion,
       -- columnas extra para filtrar/ordenar en el backend
       p.departamento_id,
       p.categoria_id,
       p.busqueda,
       p.publicado_en
  FROM productos p
  JOIN marcas m          ON m.id = p.marca_id
  JOIN departamentos d   ON d.id = p.departamento_id
  JOIN categorias c      ON c.id = p.categoria_id
  LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
 WHERE p.estado = 'publicado';

-- /admin/proveedores
CREATE VIEW v_admin_proveedores AS
SELECT pr.id::text               AS id,
       pr.nombre,
       pr.razon_social           AS "razonSocial",
       pr.ruc,
       pr.email_contacto::text   AS email,
       pr.telefono,
       pr.activo,
       (SELECT count(*) FROM productos p
         WHERE p.proveedor_id = pr.id AND p.estado = 'publicado')::int AS productos
  FROM proveedores pr;

-- /admin/dashboard  (tarjetas de KPIs)
CREATE VIEW v_dashboard_kpis AS
SELECT (SELECT count(*) FROM productos WHERE estado = 'publicado')                    AS productos_activos,
       (SELECT coalesce(sum(stock), 0) FROM productos WHERE estado = 'publicado')     AS stock_total,
       (SELECT count(*) FROM proveedores WHERE activo)                                AS proveedores_activos,
       (SELECT coalesce(sum(total), 0) FROM pedidos
         WHERE estado <> 'cancelado'
           AND creado_en >= date_trunc('month', now()))::float8                       AS ventas_mes,
       (SELECT count(*) FROM productos WHERE estado = 'pendiente_revision')           AS fichas_por_revisar;

-- Línea base: ¿cuántas fichas tenían mal la categoría elegida a mano?
CREATE VIEW v_linea_base_categorizacion AS
SELECT count(*)                                                                AS productos_con_categoria_final,
       count(*) FILTER (WHERE categoria_manual_id IS NOT NULL)                 AS con_categoria_manual,
       count(*) FILTER (WHERE categoria_manual_id <> categoria_id)             AS mal_categorizados_manual,
       round(100.0 * count(*) FILTER (WHERE categoria_manual_id <> categoria_id)
             / nullif(count(*) FILTER (WHERE categoria_manual_id IS NOT NULL), 0), 2) AS pct_error_manual
  FROM productos
 WHERE categoria_id IS NOT NULL;

-- Dataset etiquetado para entrenar CU1 y CU2: toda ficha que llegó a
-- publicarse con su categoría confirmada (publicada, pausada o archivada).
CREATE VIEW v_dataset_entrenamiento AS
SELECT p.id                AS producto_id,
       img.url             AS imagen_url,
       p.nombre            AS titulo,
       p.descripcion,
       m.nombre::text      AS marca,
       d.nombre            AS departamento,
       c.nombre            AS categoria,
       c.indice_clase      AS etiqueta
  FROM productos p
  JOIN categorias c    ON c.id = p.categoria_id
  JOIN departamentos d ON d.id = p.departamento_id
  JOIN marcas m        ON m.id = p.marca_id
  LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
 WHERE p.estado NOT IN ('borrador', 'pendiente_revision', 'rechazado');

COMMIT;

SELECT 'Migración 002 aplicada: NovaStore ahora es un e-commerce puro.' AS resultado;
