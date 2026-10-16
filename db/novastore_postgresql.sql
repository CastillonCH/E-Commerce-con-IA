-- =============================================================================
--  NovaStore Perú S.A.C. — E-Commerce con IA
--  novastore_postgresql.sql · SCRIPT ÚNICO (esquema + datos iniciales + pruebas)
--
--  Compatible con PostgreSQL 16, 17 y 18 y con Azure Database for PostgreSQL –
--  Flexible Server.
--
--  ANTES DE EJECUTAR EN AZURE:
--    1. Servidor > Configuración > Parámetros del servidor > azure.extensions:
--       marcar CITEXT, PGCRYPTO, PG_TRGM, UNACCENT, VECTOR y Guardar.
--    2. Crear la base "novastore_db" y conectarse a ELLA (no a "postgres").
--
--  CÓMO EJECUTARLO (cualquiera de las dos):
--    · psql -v ON_ERROR_STOP=1 "host=<servidor>.postgres.database.azure.com port=5432
--           dbname=novastore_db user=<admin> sslmode=require" -f novastore_postgresql.sql
--    · pgAdmin / DBeaver: abrir el archivo en el Query Tool y ejecutarlo completo (F5).
--
--  Qué hace, en orden:
--    PARTE 1  Esquema: extensiones, tipos, 19 tablas, triggers, funciones y vistas
--    PARTE 2  Datos iniciales: taxonomía (21 clases), usuarios, tiendas,
--             22 productos (los mismos del frontend) y 3 pedidos de ejemplo
--    PARTE 3  Pruebas automáticas (terminan en ROLLBACK: no cambian nada)
--    PARTE 4  (Opcional, comentada) usuarios de BD para el backend y el equipo ML
--
--  ⚠ Es re-ejecutable pero BORRA y recrea el esquema "novastore" (y sus datos).
--  Contraseña de todos los usuarios demo: NovaStore2026!  (solo desarrollo)
-- =============================================================================

-- ############################################################################
-- PARTE 1 — ESQUEMA
-- ############################################################################
SET client_min_messages = warning;

-- -----------------------------------------------------------------------------
-- 0. Extensiones (se instalan en "public" para que las vea cualquier esquema)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext   WITH SCHEMA public;  -- emails sin distinguir mayúsculas
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;  -- gen_random_uuid(), crypt() para el seed
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;  -- búsqueda aproximada por nombre
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;  -- "audifonos" encuentra "audífonos"
CREATE EXTENSION IF NOT EXISTS vector   WITH SCHEMA public;  -- pgvector: embeddings para CU5

-- -----------------------------------------------------------------------------
-- 1. Esquema de la aplicación
-- -----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS novastore CASCADE;
CREATE SCHEMA novastore;
SET search_path = novastore, public;

-- unaccent() no es IMMUTABLE; este envoltorio sí, para poder indexarlo.
CREATE FUNCTION f_unaccent(texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

-- -----------------------------------------------------------------------------
-- 2. Tipos enumerados (coinciden con types/index.ts del frontend)
-- -----------------------------------------------------------------------------
CREATE TYPE rol_usuario        AS ENUM ('ADMIN', 'SELLER', 'CLIENT');
CREATE TYPE proveedor_auth     AS ENUM ('credentials', 'google');
CREATE TYPE estado_vendedor    AS ENUM ('pendiente', 'aprobado', 'rechazado', 'suspendido');
CREATE TYPE estado_publicacion AS ENUM ('borrador', 'pendiente_revision', 'publicado', 'rechazado', 'inactivo');
CREATE TYPE estado_pedido      AS ENUM ('pendiente', 'en_camino', 'entregado', 'cancelado');
CREATE TYPE metodo_pago        AS ENUM ('tarjeta', 'yape_plin', 'contraentrega');
CREATE TYPE estado_pago        AS ENUM ('pendiente', 'aprobado', 'rechazado', 'reembolsado');
CREATE TYPE tipo_modelo        AS ENUM ('imagen', 'texto', 'multimodal');
CREATE TYPE estado_modelo      AS ENUM ('planificado', 'entrenando', 'evaluado', 'en_produccion', 'retirado');
CREATE TYPE fuente_embedding   AS ENUM ('imagen', 'texto');
CREATE TYPE accion_revision    AS ENUM ('aceptada', 'corregida');
CREATE TYPE estado_duplicado   AS ENUM ('pendiente', 'confirmado', 'descartado');

-- -----------------------------------------------------------------------------
-- 3. Función genérica para mantener "actualizado_en"
-- -----------------------------------------------------------------------------
CREATE FUNCTION fn_set_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END $$;

-- =============================================================================
-- 4. USUARIOS Y VENDEDORES
-- =============================================================================

-- Una sola tabla para los tres roles. El rol SIEMPRE sale de aquí (nunca del
-- formulario de login), lo que corrige el atajo de desarrollo de staff-login.
CREATE TABLE usuarios (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          varchar(120) NOT NULL CHECK (length(btrim(nombre)) >= 2),
    email           citext       NOT NULL UNIQUE
                                 CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash   text,                                   -- bcrypt; NULL si entra solo con Google
    proveedor       proveedor_auth NOT NULL DEFAULT 'credentials',
    google_sub      varchar(64)  UNIQUE,                    -- "sub" del id_token de Google
    rol             rol_usuario  NOT NULL DEFAULT 'CLIENT',
    telefono        varchar(20),
    activo          boolean      NOT NULL DEFAULT true,
    ultimo_acceso   timestamptz,
    creado_en       timestamptz  NOT NULL DEFAULT now(),
    actualizado_en  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuarios_credenciales CHECK (
        (proveedor = 'credentials' AND password_hash IS NOT NULL) OR
        (proveedor = 'google'      AND google_sub    IS NOT NULL)
    )
);
COMMENT ON TABLE  usuarios IS 'Clientes, vendedores y administradores. El rol se asigna en el backend, nunca desde el cliente.';
COMMENT ON COLUMN usuarios.password_hash IS 'Hash bcrypt ($2a$/$2b$). Nunca guardar contraseñas en texto plano.';

CREATE TRIGGER trg_usuarios_actualizado
    BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Departamentos: nivel 1 de la taxonomía (Tabla 2 del T1).
CREATE TABLE departamentos (
    id      smallint    PRIMARY KEY,
    nombre  varchar(40) NOT NULL UNIQUE,
    slug    varchar(40) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    orden   smallint    NOT NULL DEFAULT 0
);

-- Ficha comercial del vendedor (una mipyme). Se crea al postular y el
-- administrador la aprueba o rechaza desde /admin/vendedores.
CREATE TABLE vendedores (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          uuid          NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre_comercial    varchar(120)  NOT NULL,
    razon_social        varchar(160),
    ruc                 char(11)      UNIQUE CHECK (ruc ~ '^(10|15|17|20)[0-9]{9}$'),
    email_contacto      citext,
    telefono            varchar(20),
    departamento_id     smallint      REFERENCES departamentos(id),   -- rubro principal
    estado              estado_vendedor NOT NULL DEFAULT 'pendiente',
    motivo_rechazo      text,
    revisado_por        uuid          REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_solicitud     timestamptz   NOT NULL DEFAULT now(),
    fecha_revision      timestamptz,
    comision_pct        numeric(5,2)  NOT NULL DEFAULT 10.00 CHECK (comision_pct BETWEEN 0 AND 100),
    creado_en           timestamptz   NOT NULL DEFAULT now(),
    actualizado_en      timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT ck_vendedores_rechazo CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX ix_vendedores_estado ON vendedores (estado);
CREATE TRIGGER trg_vendedores_actualizado
    BEFORE UPDATE ON vendedores FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Al aprobar a un vendedor su usuario pasa a rol SELLER; al suspenderlo o
-- rechazarlo vuelve a CLIENT (nunca se toca a un ADMIN).
CREATE FUNCTION fn_vendedor_sync_rol()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado IS DISTINCT FROM OLD.estado OR TG_OP = 'INSERT' THEN
        IF NEW.estado IN ('aprobado', 'rechazado', 'suspendido') THEN
            NEW.fecha_revision := coalesce(NEW.fecha_revision, now());
        END IF;
        UPDATE usuarios
           SET rol = CASE WHEN NEW.estado = 'aprobado' THEN 'SELLER'::rol_usuario
                          ELSE 'CLIENT'::rol_usuario END
         WHERE id = NEW.usuario_id AND rol <> 'ADMIN';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_vendedores_sync_rol
    BEFORE INSERT OR UPDATE OF estado ON vendedores
    FOR EACH ROW EXECUTE FUNCTION fn_vendedor_sync_rol();

-- Direcciones de envío guardadas por el cliente (/perfil > Direcciones).
CREATE TABLE direcciones (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id            uuid         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    alias                 varchar(40)  NOT NULL DEFAULT 'Casa',
    nombre_destinatario   varchar(120) NOT NULL,
    direccion             varchar(200) NOT NULL,
    distrito              varchar(80),
    ciudad                varchar(80)  NOT NULL,
    referencia            varchar(200),
    telefono              varchar(20)  NOT NULL,
    es_predeterminada     boolean      NOT NULL DEFAULT false,
    creado_en             timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_direcciones_usuario ON direcciones (usuario_id);
-- Máximo una dirección predeterminada por usuario.
CREATE UNIQUE INDEX ux_direcciones_predeterminada
    ON direcciones (usuario_id) WHERE es_predeterminada;

-- =============================================================================
-- 5. CATÁLOGO
-- =============================================================================

-- Categorías: nivel 2 de la taxonomía = las 21 CLASES que predice el modelo.
-- "indice_clase" es la posición de la neurona de salida (0..20), así el
-- backend traduce la salida del modelo sin tablas intermedias.
CREATE TABLE categorias (
    id               smallint    PRIMARY KEY,
    departamento_id  smallint    NOT NULL REFERENCES departamentos(id),
    nombre           varchar(60) NOT NULL UNIQUE,
    slug             varchar(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    indice_clase     smallint    NOT NULL UNIQUE CHECK (indice_clase >= 0),
    activa           boolean     NOT NULL DEFAULT true,
    UNIQUE (id, departamento_id)   -- permite la FK compuesta desde productos
);
CREATE INDEX ix_categorias_departamento ON categorias (departamento_id);

CREATE TABLE marcas (
    id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  citext  NOT NULL UNIQUE CHECK (length(btrim(nombre)) >= 2)
);

CREATE TABLE productos (
    id                     bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendedor_id            uuid          NOT NULL REFERENCES vendedores(id) ON DELETE RESTRICT,
    sku                    varchar(40),
    nombre                 varchar(200)  NOT NULL CHECK (length(btrim(nombre)) >= 2),
    descripcion            text,
    marca_id               integer       NOT NULL REFERENCES marcas(id),
    departamento_id        smallint      NOT NULL REFERENCES departamentos(id),
    -- Categoría que eligió el vendedor a mano (proceso actual, P1). Sirve de
    -- línea base: permite medir el ≈10 % de publicaciones mal categorizadas.
    categoria_vendedor_id  smallint      REFERENCES categorias(id),
    -- Categoría definitiva (sugerida por la IA y confirmada por el analista).
    -- Es la que usa la tienda en filtros y la etiqueta del dataset.
    categoria_id           smallint,
    precio                 numeric(10,2) NOT NULL CHECK (precio > 0),
    precio_original        numeric(10,2),
    stock                  integer       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    envio_gratis           boolean       NOT NULL DEFAULT false,
    es_nuevo               boolean       NOT NULL DEFAULT false,
    estado                 estado_publicacion NOT NULL DEFAULT 'pendiente_revision',
    motivo_rechazo         text,
    rating_promedio        numeric(2,1)  NOT NULL DEFAULT 0 CHECK (rating_promedio BETWEEN 0 AND 5),
    num_resenas            integer       NOT NULL DEFAULT 0 CHECK (num_resenas >= 0),
    revisado_por           uuid          REFERENCES usuarios(id) ON DELETE SET NULL,
    publicado_en           timestamptz,
    creado_en              timestamptz   NOT NULL DEFAULT now(),
    actualizado_en         timestamptz   NOT NULL DEFAULT now(),
    -- Texto para búsqueda de texto completo en español.
    busqueda               tsvector GENERATED ALWAYS AS (
                               setweight(to_tsvector('spanish', coalesce(nombre, '')), 'A') ||
                               setweight(to_tsvector('spanish', coalesce(descripcion, '')), 'B')
                           ) STORED,
    CONSTRAINT ck_productos_precio_original CHECK (precio_original IS NULL OR precio_original > precio),
    CONSTRAINT uq_productos_sku_vendedor UNIQUE (vendedor_id, sku),
    -- La categoría final debe pertenecer al departamento del producto.
    CONSTRAINT fk_productos_categoria_depto
        FOREIGN KEY (categoria_id, departamento_id) REFERENCES categorias (id, departamento_id),
    CONSTRAINT ck_productos_publicado_con_categoria
        CHECK (estado <> 'publicado' OR categoria_id IS NOT NULL)
);
COMMENT ON COLUMN productos.categoria_vendedor_id IS 'Categoría elegida manualmente por el vendedor (línea base del problema).';
COMMENT ON COLUMN productos.categoria_id IS 'Categoría definitiva usada por la tienda; etiqueta del dataset de entrenamiento.';

CREATE INDEX ix_productos_vendedor      ON productos (vendedor_id);
CREATE INDEX ix_productos_departamento  ON productos (departamento_id) WHERE estado = 'publicado';
CREATE INDEX ix_productos_categoria     ON productos (categoria_id)    WHERE estado = 'publicado';
CREATE INDEX ix_productos_estado        ON productos (estado, creado_en DESC);
CREATE INDEX ix_productos_marca         ON productos (marca_id);
CREATE INDEX ix_productos_busqueda      ON productos USING gin (busqueda);
CREATE INDEX ix_productos_nombre_trgm   ON productos USING gin (f_unaccent(lower(nombre)) gin_trgm_ops);

CREATE TRIGGER trg_productos_actualizado
    BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Reglas de negocio al publicar: el vendedor debe estar aprobado y se
-- registra la fecha de publicación.
CREATE FUNCTION fn_productos_reglas_publicacion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_estado_vendedor estado_vendedor;
BEGIN
    IF NEW.estado = 'publicado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'publicado') THEN
        SELECT estado INTO v_estado_vendedor FROM vendedores WHERE id = NEW.vendedor_id;
        IF v_estado_vendedor IS DISTINCT FROM 'aprobado' THEN
            RAISE EXCEPTION 'No se puede publicar: el vendedor % no está aprobado (estado: %)',
                NEW.vendedor_id, v_estado_vendedor
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.publicado_en := coalesce(NEW.publicado_en, now());
    END IF;
    IF NEW.estado = 'rechazado' AND NEW.motivo_rechazo IS NULL THEN
        RAISE EXCEPTION 'Indique motivo_rechazo al rechazar un producto'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_productos_reglas_publicacion
    BEFORE INSERT OR UPDATE OF estado ON productos
    FOR EACH ROW EXECUTE FUNCTION fn_productos_reglas_publicacion();

-- Imágenes (Azure Blob Storage). La principal es la que clasifica CU1.
CREATE TABLE producto_imagenes (
    id            bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id   bigint        NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    -- https:// siempre (Azure Blob en producción); también http:// para el
    -- fallback de desarrollo local sin Azure configurado (lib/storage.ts)
    -- — ver db/migraciones/001_permitir_http_en_producto_imagenes.sql.
    url           varchar(500)  NOT NULL CHECK (url ~ '^https?://'),
    blob_path     varchar(300),                          -- ruta dentro del contenedor
    es_principal  boolean       NOT NULL DEFAULT false,
    orden         smallint      NOT NULL DEFAULT 0,
    ancho_px      integer       CHECK (ancho_px > 0),
    alto_px       integer       CHECK (alto_px > 0),
    sha256        char(64),                              -- detecta la misma foto subida dos veces
    creado_en     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_producto_imagenes_producto ON producto_imagenes (producto_id, orden);
CREATE UNIQUE INDEX ux_producto_imagen_principal
    ON producto_imagenes (producto_id) WHERE es_principal;
CREATE INDEX ix_producto_imagenes_sha256 ON producto_imagenes (sha256) WHERE sha256 IS NOT NULL;

-- Reseñas: mantienen rating_promedio y num_resenas del producto.
CREATE TABLE resenas (
    id            bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id   bigint       NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cliente_id    uuid         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    calificacion  smallint     NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario    text,
    creado_en     timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (producto_id, cliente_id)
);

-- Actualización incremental: respeta los valores históricos ya cargados.
CREATE FUNCTION fn_resenas_rating()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE productos
           SET rating_promedio = round((rating_promedio * num_resenas + NEW.calificacion) / (num_resenas + 1), 1),
               num_resenas     = num_resenas + 1
         WHERE id = NEW.producto_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE productos
           SET rating_promedio = CASE WHEN num_resenas <= 1 THEN 0
                                      ELSE round((rating_promedio * num_resenas - OLD.calificacion) / (num_resenas - 1), 1) END,
               num_resenas     = greatest(num_resenas - 1, 0)
         WHERE id = OLD.producto_id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_resenas_rating
    AFTER INSERT OR DELETE ON resenas
    FOR EACH ROW EXECUTE FUNCTION fn_resenas_rating();

-- =============================================================================
-- 6. MÓDULO DE IA (CU1 imagen, CU2 texto, CU5 duplicados)
-- =============================================================================

-- Registro de modelos entrenados (versionado simple tipo "model registry").
CREATE TABLE modelos_ia (
    id                   smallint     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo               varchar(60)  NOT NULL UNIQUE,     -- p. ej. 'cu1-resnet50-v1'
    caso_uso             varchar(4)   NOT NULL CHECK (caso_uso IN ('CU1', 'CU2', 'CU5')),
    tipo                 tipo_modelo  NOT NULL,
    arquitectura         varchar(80)  NOT NULL,            -- ResNet-50, EfficientNet-B0, BETO...
    version              varchar(20)  NOT NULL DEFAULT '1.0',
    dimension_embedding  smallint     CHECK (dimension_embedding > 0),
    num_clases           smallint     CHECK (num_clases > 0),
    ruta_artefacto       varchar(300),                     -- dónde está el .pt / carpeta HF
    hiperparametros      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    metricas             jsonb        NOT NULL DEFAULT '{}'::jsonb,  -- {"accuracy":..,"f1_macro":..}
    estado               estado_modelo NOT NULL DEFAULT 'planificado',
    entrenado_en         timestamptz,
    creado_en            timestamptz  NOT NULL DEFAULT now()
);
-- Solo un modelo en producción por tipo (imagen / texto / multimodal).
CREATE UNIQUE INDEX ux_modelos_ia_en_produccion
    ON modelos_ia (tipo) WHERE estado = 'en_produccion';

-- Cada inferencia del modelo. Es la fuente de la respuesta AIResponse del
-- frontend y de las métricas en producción.
CREATE TABLE predicciones_ia (
    id                     bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id            bigint       NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    modelo_id              smallint     NOT NULL REFERENCES modelos_ia(id),
    imagen_id              bigint       REFERENCES producto_imagenes(id) ON DELETE SET NULL,
    categoria_predicha_id  smallint     NOT NULL REFERENCES categorias(id),
    confianza              numeric(5,4) NOT NULL CHECK (confianza BETWEEN 0 AND 1),
    top_k                  jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- [{"categoria_id":3,"prob":0.91},...]
    latencia_ms            integer      CHECK (latencia_ms >= 0),
    creado_en              timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN predicciones_ia.confianza IS 'Probabilidad softmax de la clase predicha (NO es la accuracy del modelo).';
CREATE INDEX ix_predicciones_producto ON predicciones_ia (producto_id, creado_en DESC);
CREATE INDEX ix_predicciones_modelo   ON predicciones_ia (modelo_id, creado_en DESC);

-- Decisión del analista de Catálogo sobre la sugerencia (acepta o corrige).
-- Permite medir el objetivo general: % mal categorizados y minutos por ficha.
CREATE TABLE revisiones_categoria (
    id                      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id             bigint      NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    prediccion_id           bigint      REFERENCES predicciones_ia(id) ON DELETE SET NULL,
    categoria_sugerida_id   smallint    REFERENCES categorias(id),
    categoria_final_id      smallint    NOT NULL REFERENCES categorias(id),
    accion                  accion_revision NOT NULL,
    revisado_por            uuid        NOT NULL REFERENCES usuarios(id),
    tiempo_revision_seg     integer     CHECK (tiempo_revision_seg >= 0),
    comentario              text,
    creado_en               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_revision_coherente CHECK (
        categoria_sugerida_id IS NULL OR
        (accion = 'aceptada'  AND categoria_final_id =  categoria_sugerida_id) OR
        (accion = 'corregida' AND categoria_final_id <> categoria_sugerida_id)
    )
);
CREATE INDEX ix_revisiones_producto ON revisiones_categoria (producto_id, creado_en DESC);

-- Al registrar la revisión, la categoría final pasa al producto.
CREATE FUNCTION fn_revision_aplicar_categoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE productos
       SET categoria_id = NEW.categoria_final_id,
           revisado_por = NEW.revisado_por
     WHERE id = NEW.producto_id;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_revision_aplicar_categoria
    AFTER INSERT ON revisiones_categoria
    FOR EACH ROW EXECUTE FUNCTION fn_revision_aplicar_categoria();

-- Embeddings por producto (CU5). La dimensión depende del modelo:
-- ResNet-50 = 2048, EfficientNet-B0 = 1280, BETO = 768.
CREATE TABLE producto_embeddings (
    producto_id   bigint           NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    modelo_id     smallint         NOT NULL REFERENCES modelos_ia(id),
    fuente        fuente_embedding NOT NULL,
    embedding     vector           NOT NULL,
    creado_en     timestamptz      NOT NULL DEFAULT now(),
    PRIMARY KEY (producto_id, modelo_id)
);
CREATE INDEX ix_producto_embeddings_modelo ON producto_embeddings (modelo_id);
-- Con ≈8 000 productos la búsqueda exacta (sin índice) responde en ms.
-- Si el catálogo crece, crear un índice HNSW por modelo, por ejemplo para BETO (768):
--   CREATE INDEX ix_emb_beto_hnsw ON producto_embeddings
--     USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE modelo_id = <id BETO>;
-- (HNSW admite hasta 2 000 dimensiones con "vector"; para 2 048 usar halfvec.)

-- Valida que el vector tenga la dimensión declarada por el modelo.
CREATE FUNCTION fn_embedding_valida_dimension()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_dim smallint;
BEGIN
    SELECT dimension_embedding INTO v_dim FROM modelos_ia WHERE id = NEW.modelo_id;
    IF v_dim IS NULL THEN
        RAISE EXCEPTION 'El modelo % no declara dimension_embedding', NEW.modelo_id;
    END IF;
    IF vector_dims(NEW.embedding) <> v_dim THEN
        RAISE EXCEPTION 'Dimensión incorrecta: el modelo % espera %, llegó %',
            NEW.modelo_id, v_dim, vector_dims(NEW.embedding);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_embedding_valida_dimension
    BEFORE INSERT OR UPDATE ON producto_embeddings
    FOR EACH ROW EXECUTE FUNCTION fn_embedding_valida_dimension();

-- Pares candidatos a duplicado y su verificación manual (métrica de OE3).
CREATE TABLE duplicados_detectados (
    id                   bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_a_id        bigint       NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    producto_b_id        bigint       NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    similitud_texto      numeric(5,4) CHECK (similitud_texto  BETWEEN -1 AND 1),
    similitud_imagen     numeric(5,4) CHECK (similitud_imagen BETWEEN -1 AND 1),
    similitud_combinada  numeric(5,4) NOT NULL CHECK (similitud_combinada BETWEEN -1 AND 1),
    umbral_usado         numeric(5,4) NOT NULL,
    estado               estado_duplicado NOT NULL DEFAULT 'pendiente',
    revisado_por         uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
    revisado_en          timestamptz,
    creado_en            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_duplicado_orden CHECK (producto_a_id < producto_b_id),  -- evita (A,B) y (B,A)
    CONSTRAINT uq_duplicado_par UNIQUE (producto_a_id, producto_b_id)
);
CREATE INDEX ix_duplicados_estado ON duplicados_detectados (estado);

-- =============================================================================
-- 7. CARRITO, PEDIDOS Y PAGOS
-- =============================================================================

-- Carrito persistente (el frontend hoy lo guarda en localStorage).
CREATE TABLE carrito_items (
    usuario_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    producto_id   bigint      NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad      integer     NOT NULL CHECK (cantidad BETWEEN 1 AND 99),
    agregado_en   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, producto_id)
);

CREATE SEQUENCE seq_codigo_pedido START 10000001;

CREATE TABLE pedidos (
    id                 bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo             varchar(20)   NOT NULL UNIQUE
                                     DEFAULT 'PED-' || lpad(nextval('seq_codigo_pedido')::text, 8, '0'),
    cliente_id         uuid          NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    -- Copia de la dirección al momento de comprar (la dirección puede cambiar después).
    envio_nombre       varchar(120)  NOT NULL,
    envio_direccion    varchar(200)  NOT NULL,
    envio_ciudad       varchar(80)   NOT NULL,
    envio_telefono     varchar(20)   NOT NULL,
    metodo_pago        metodo_pago   NOT NULL,
    subtotal           numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    costo_envio        numeric(10,2) NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
    total              numeric(12,2) GENERATED ALWAYS AS (subtotal + costo_envio) STORED,
    estado             estado_pedido NOT NULL DEFAULT 'pendiente',
    creado_en          timestamptz   NOT NULL DEFAULT now(),
    actualizado_en     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedidos_cliente ON pedidos (cliente_id, creado_en DESC);
CREATE INDEX ix_pedidos_estado  ON pedidos (estado, creado_en DESC);
CREATE TRIGGER trg_pedidos_actualizado
    BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TABLE pedido_items (
    id                bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id         bigint        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id       bigint        NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    vendedor_id       uuid          NOT NULL REFERENCES vendedores(id),
    nombre_producto   varchar(200)  NOT NULL,     -- copia histórica
    imagen_url        varchar(500),
    precio_unitario   numeric(10,2) NOT NULL CHECK (precio_unitario > 0),
    cantidad          integer       NOT NULL CHECK (cantidad > 0),
    subtotal          numeric(12,2) GENERATED ALWAYS AS (precio_unitario * cantidad) STORED,
    UNIQUE (pedido_id, producto_id)
);
CREATE INDEX ix_pedido_items_producto ON pedido_items (producto_id);
CREATE INDEX ix_pedido_items_vendedor ON pedido_items (vendedor_id);

-- Descuenta stock al vender (el CHECK stock >= 0 impide sobreventa) y
-- recalcula el subtotal del pedido. El precio lo pone la BD, no el cliente.
CREATE FUNCTION fn_pedido_items_antes()
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
    NEW.vendedor_id     := p.vendedor_id;
    NEW.nombre_producto := p.nombre;
    NEW.precio_unitario := p.precio;
    NEW.imagen_url      := coalesce(NEW.imagen_url,
                           (SELECT url FROM producto_imagenes
                             WHERE producto_id = p.id AND es_principal LIMIT 1));
    UPDATE productos SET stock = stock - NEW.cantidad WHERE id = p.id;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_pedido_items_antes
    BEFORE INSERT ON pedido_items
    FOR EACH ROW EXECUTE FUNCTION fn_pedido_items_antes();

CREATE FUNCTION fn_pedido_recalcular_subtotal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_pedido bigint := coalesce(NEW.pedido_id, OLD.pedido_id);
BEGIN
    UPDATE pedidos
       SET subtotal = (SELECT coalesce(sum(subtotal), 0) FROM pedido_items WHERE pedido_id = v_pedido)
     WHERE id = v_pedido;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_pedido_items_subtotal
    AFTER INSERT OR DELETE ON pedido_items
    FOR EACH ROW EXECUTE FUNCTION fn_pedido_recalcular_subtotal();

-- Historial de estados del pedido (auditoría para /admin/pedidos).
CREATE TABLE pedido_estados_historial (
    id               bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id        bigint        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    estado_anterior  estado_pedido,
    estado_nuevo     estado_pedido NOT NULL,
    cambiado_por     uuid          REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_historial ON pedido_estados_historial (pedido_id, creado_en);

-- Registra cambios de estado y devuelve el stock si se cancela.
-- El backend puede indicar quién hizo el cambio con:
--   SET LOCAL novastore.usuario_id = '<uuid>';
CREATE FUNCTION fn_pedidos_cambio_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_usuario uuid := nullif(current_setting('novastore.usuario_id', true), '')::uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO pedido_estados_historial (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
        VALUES (NEW.id, NULL, NEW.estado, coalesce(v_usuario, NEW.cliente_id));
        RETURN NULL;
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF OLD.estado IN ('entregado', 'cancelado') THEN
            RAISE EXCEPTION 'El pedido % ya está % y no puede cambiar de estado', OLD.codigo, OLD.estado
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.estado = 'cancelado' THEN
            UPDATE productos pr
               SET stock = pr.stock + pi.cantidad
              FROM pedido_items pi
             WHERE pi.pedido_id = NEW.id AND pi.producto_id = pr.id;
        END IF;
        INSERT INTO pedido_estados_historial (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
        VALUES (NEW.id, OLD.estado, NEW.estado, v_usuario);
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_pedidos_cambio_estado
    AFTER INSERT OR UPDATE OF estado ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_pedidos_cambio_estado();

CREATE TABLE pagos (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id           bigint        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    metodo              metodo_pago   NOT NULL,
    monto               numeric(12,2) NOT NULL CHECK (monto > 0),
    estado              estado_pago   NOT NULL DEFAULT 'pendiente',
    referencia_externa  varchar(120),   -- id de la pasarela (Culqi, Niubiz, Yape...)
    creado_en           timestamptz   NOT NULL DEFAULT now(),
    actualizado_en      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_pagos_pedido ON pagos (pedido_id);
CREATE TRIGGER trg_pagos_actualizado
    BEFORE UPDATE ON pagos FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- =============================================================================
-- 8. FUNCIONES DE APLICACIÓN
-- =============================================================================

-- Crea un pedido completo en una sola transacción a partir de un JSON de
-- items: [{"producto_id": 1, "cantidad": 2}, ...]. Precio y stock se validan
-- en la BD. Envío gratis a partir de S/ 199 (APP_CONFIG.freeShippingThreshold).
CREATE FUNCTION fn_crear_pedido(
    p_cliente_id   uuid,
    p_items        jsonb,
    p_metodo_pago  metodo_pago,
    p_nombre       varchar,
    p_direccion    varchar,
    p_ciudad       varchar,
    p_telefono     varchar,
    p_umbral_envio_gratis numeric DEFAULT 199,
    p_costo_envio  numeric DEFAULT 15
) RETURNS pedidos
LANGUAGE plpgsql AS $$
DECLARE
    v_pedido pedidos%ROWTYPE;
    v_item   jsonb;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El pedido no tiene items' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO pedidos (cliente_id, envio_nombre, envio_direccion, envio_ciudad, envio_telefono, metodo_pago)
    VALUES (p_cliente_id, p_nombre, p_direccion, p_ciudad, p_telefono, p_metodo_pago)
    RETURNING * INTO v_pedido;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- vendedor, nombre y precio los completa trg_pedido_items_antes
        INSERT INTO pedido_items (pedido_id, producto_id, cantidad)
        VALUES (v_pedido.id, (v_item->>'producto_id')::bigint, (v_item->>'cantidad')::int);
    END LOOP;

    UPDATE pedidos
       SET costo_envio = CASE WHEN subtotal >= p_umbral_envio_gratis THEN 0 ELSE p_costo_envio END
     WHERE id = v_pedido.id
    RETURNING * INTO v_pedido;

    INSERT INTO pagos (pedido_id, metodo, monto) VALUES (v_pedido.id, p_metodo_pago, v_pedido.total);

    DELETE FROM carrito_items WHERE usuario_id = p_cliente_id;
    RETURN v_pedido;
END $$;
COMMENT ON FUNCTION fn_crear_pedido IS 'Checkout transaccional: valida stock, fija precios desde la BD, calcula envío y registra el pago pendiente.';

-- Busca candidatos a duplicado de un producto usando similitud coseno.
-- Devuelve los k vecinos más cercanos por encima del umbral.
CREATE FUNCTION fn_buscar_duplicados(
    p_producto_id bigint,
    p_modelo_id   smallint,
    p_umbral      numeric DEFAULT 0.90,
    p_k           integer DEFAULT 5
) RETURNS TABLE (producto_id bigint, nombre varchar, similitud numeric)
LANGUAGE sql STABLE AS $$
    SELECT e2.producto_id,
           pr.nombre,
           round((1 - (e1.embedding <=> e2.embedding))::numeric, 4) AS similitud
      FROM producto_embeddings e1
      JOIN producto_embeddings e2
        ON e2.modelo_id = e1.modelo_id AND e2.producto_id <> e1.producto_id
      JOIN productos pr ON pr.id = e2.producto_id
     WHERE e1.producto_id = p_producto_id
       AND e1.modelo_id   = p_modelo_id
       AND 1 - (e1.embedding <=> e2.embedding) >= p_umbral
     ORDER BY e1.embedding <=> e2.embedding
     LIMIT p_k
$$;

-- =============================================================================
-- 9. VISTAS (con los mismos nombres de campo que usa el frontend)
-- =============================================================================

-- Tienda: devuelve exactamente la forma de "Product" de types/index.ts.
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
       p.vendedor_id,
       p.busqueda,
       p.publicado_en
  FROM productos p
  JOIN marcas m          ON m.id = p.marca_id
  JOIN departamentos d   ON d.id = p.departamento_id
  JOIN categorias c      ON c.id = p.categoria_id
  LEFT JOIN producto_imagenes img ON img.producto_id = p.id AND img.es_principal
 WHERE p.estado = 'publicado';

-- /admin/clientes  (AdminClientRow)
CREATE VIEW v_admin_clientes AS
SELECT u.id::text                                  AS id,
       u.nombre,
       u.email::text                               AS email,
       u.creado_en                                 AS "fechaRegistro",
       count(pe.id) FILTER (WHERE pe.estado <> 'cancelado')                 AS pedidos,
       coalesce(sum(pe.total) FILTER (WHERE pe.estado <> 'cancelado'), 0)::float8 AS "totalGastado"
  FROM usuarios u
  LEFT JOIN pedidos pe ON pe.cliente_id = u.id
 WHERE u.rol = 'CLIENT'
 GROUP BY u.id;

-- /admin/vendedores  (solicitudes y activos)
CREATE VIEW v_admin_vendedores AS
SELECT v.id::text               AS id,
       v.nombre_comercial       AS nombre,
       coalesce(v.email_contacto, u.email)::text AS email,
       d.nombre                 AS categoria,     -- rubro principal (el frontend lo llama "categoria")
       v.estado,
       v.fecha_solicitud        AS fecha,
       (SELECT count(*) FROM productos p WHERE p.vendedor_id = v.id AND p.estado = 'publicado') AS productos
  FROM vendedores v
  JOIN usuarios u ON u.id = v.usuario_id
  LEFT JOIN departamentos d ON d.id = v.departamento_id;

-- /admin/dashboard  (tarjetas de KPIs)
CREATE VIEW v_dashboard_kpis AS
SELECT (SELECT count(*) FROM productos WHERE estado = 'publicado')                    AS productos_activos,
       (SELECT coalesce(sum(stock), 0) FROM productos WHERE estado = 'publicado')     AS stock_total,
       (SELECT count(*) FROM vendedores WHERE estado = 'aprobado')                    AS vendedores_activos,
       (SELECT count(*) FROM vendedores WHERE estado = 'pendiente')                   AS solicitudes_pendientes,
       (SELECT coalesce(sum(total), 0) FROM pedidos
         WHERE estado <> 'cancelado'
           AND creado_en >= date_trunc('month', now()))::float8                       AS ventas_mes,
       (SELECT count(*) FROM productos WHERE estado = 'pendiente_revision')           AS fichas_por_revisar;

-- Métricas del objetivo general (Tabla 10 del T1) a partir de lo que ocurre
-- en producción: % de sugerencias corregidas y tiempo de revisión por ficha.
CREATE VIEW v_metricas_clasificacion AS
SELECT m.codigo                                              AS modelo,
       m.caso_uso,
       count(r.id)                                           AS fichas_revisadas,
       count(r.id) FILTER (WHERE r.accion = 'aceptada')      AS aceptadas,
       count(r.id) FILTER (WHERE r.accion = 'corregida')     AS corregidas,
       round(100.0 * count(r.id) FILTER (WHERE r.accion = 'aceptada') / nullif(count(r.id), 0), 2) AS pct_acierto,
       round(100.0 * count(r.id) FILTER (WHERE r.accion = 'corregida') / nullif(count(r.id), 0), 2) AS pct_corregidas,
       round(avg(r.tiempo_revision_seg) / 60.0, 2)            AS minutos_promedio_revision,
       round(avg(pi.confianza), 4)                            AS confianza_promedio
  FROM modelos_ia m
  LEFT JOIN predicciones_ia pi       ON pi.modelo_id = m.id
  LEFT JOIN revisiones_categoria r   ON r.prediccion_id = pi.id
 GROUP BY m.id, m.codigo, m.caso_uso;

-- Línea base: ¿cuántas publicaciones tenían mal la categoría elegida por el vendedor?
CREATE VIEW v_linea_base_categorizacion AS
SELECT count(*)                                                                  AS productos_con_categoria_final,
       count(*) FILTER (WHERE categoria_vendedor_id IS NOT NULL)                  AS con_categoria_del_vendedor,
       count(*) FILTER (WHERE categoria_vendedor_id <> categoria_id)              AS mal_categorizados_por_vendedor,
       round(100.0 * count(*) FILTER (WHERE categoria_vendedor_id <> categoria_id)
             / nullif(count(*) FILTER (WHERE categoria_vendedor_id IS NOT NULL), 0), 2) AS pct_error_vendedor
  FROM productos
 WHERE categoria_id IS NOT NULL;

-- Precisión de CU5 sobre pares verificados manualmente (meta OE3 ≥ 90 %).
CREATE VIEW v_metricas_duplicados AS
SELECT count(*) FILTER (WHERE estado = 'confirmado')  AS verdaderos_positivos,
       count(*) FILTER (WHERE estado = 'descartado')  AS falsos_positivos,
       count(*) FILTER (WHERE estado = 'pendiente')   AS pendientes,
       round(100.0 * count(*) FILTER (WHERE estado = 'confirmado')
             / nullif(count(*) FILTER (WHERE estado IN ('confirmado', 'descartado')), 0), 2) AS precision_pct
  FROM duplicados_detectados;

-- Dataset etiquetado para entrenar CU1 y CU2 (exportar a CSV desde Python).
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
 WHERE p.estado IN ('publicado', 'inactivo');

-- =============================================================================
-- 10. search_path por defecto de la base (así el backend no necesita
--     anteponer "novastore." a cada tabla)
-- =============================================================================
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path = novastore, public', current_database());
    EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'America/Lima');
EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudo fijar search_path de la base; agrega options=-csearch_path=novastore,public a la cadena de conexión.';
END $$;

-- Fin del esquema.
SELECT 'Esquema novastore creado correctamente.' AS resultado;

-- ############################################################################
-- PARTE 2 — DATOS INICIALES
-- ############################################################################
SET search_path = novastore, public;

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Taxonomía (Tabla 2 del T1): 7 departamentos × 3 categorías = 21 clases
-- -----------------------------------------------------------------------------
INSERT INTO departamentos (id, nombre, slug, orden) VALUES
    (1, 'Electrónica',  'electronica',  1),
    (2, 'Hogar',        'hogar',        2),
    (3, 'Moda',         'moda',         3),
    (4, 'Deportes',     'deportes',     4),
    (5, 'Belleza',      'belleza',      5),
    (6, 'Juguetes',     'juguetes',     6),
    (7, 'Supermercado', 'supermercado', 7);

-- indice_clase = índice de salida del modelo (0..20). No cambiarlo una vez
-- entrenado el modelo, o las predicciones quedarán desalineadas.
INSERT INTO categorias (id, departamento_id, nombre, slug, indice_clase) VALUES
    ( 1, 1, 'Audio y audífonos',                'audio-y-audifonos',                 0),
    ( 2, 1, 'Laptops y computadoras',           'laptops-y-computadoras',            1),
    ( 3, 1, 'Relojes inteligentes y wearables', 'relojes-inteligentes-y-wearables',  2),
    ( 4, 2, 'Electrodomésticos de cocina',      'electrodomesticos-de-cocina',       3),
    ( 5, 2, 'Muebles',                          'muebles',                           4),
    ( 6, 2, 'Decoración y menaje',              'decoracion-y-menaje',               5),
    ( 7, 3, 'Casacas y abrigos',                'casacas-y-abrigos',                 6),
    ( 8, 3, 'Zapatillas y calzado',             'zapatillas-y-calzado',              7),
    ( 9, 3, 'Polos y camisas',                  'polos-y-camisas',                   8),
    (10, 4, 'Balones',                          'balones',                           9),
    (11, 4, 'Ropa deportiva',                   'ropa-deportiva',                   10),
    (12, 4, 'Equipos de fitness',               'equipos-de-fitness',               11),
    (13, 5, 'Fragancias',                       'fragancias',                       12),
    (14, 5, 'Maquillaje',                       'maquillaje',                       13),
    (15, 5, 'Herramientas de belleza',          'herramientas-de-belleza',          14),
    (16, 6, 'Bloques de construcción',          'bloques-de-construccion',          15),
    (17, 6, 'Peluches',                         'peluches',                         16),
    (18, 6, 'Vehículos de juguete',             'vehiculos-de-juguete',             17),
    (19, 7, 'Bebidas',                          'bebidas',                          18),
    (20, 7, 'Abarrotes y snacks',               'abarrotes-y-snacks',               19),
    (21, 7, 'Limpieza del hogar',               'limpieza-del-hogar',               20);

-- -----------------------------------------------------------------------------
-- 2. Usuarios demo
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _usuarios_demo (nombre text, email text, rol rol_usuario, creado date) ON COMMIT DROP;
INSERT INTO _usuarios_demo VALUES
    -- Staff
    ('Administrador NovaStore', 'admin@novastore.pe',          'ADMIN',  '2026-01-05'),
    ('Analista de Catálogo',    'catalogo@novastore.pe',       'ADMIN',  '2026-01-05'),
    -- Dueños de las tiendas (se vuelven SELLER al aprobar su ficha de vendedor)
    ('SoundMax Perú',           'contacto@soundmax.pe',        'CLIENT', '2026-01-10'),
    ('HogarPlus',               'ventas@hogarplus.pe',         'CLIENT', '2026-01-12'),
    ('UrbanWear',               'hola@urbanwear.pe',           'CLIENT', '2026-01-15'),
    ('ProSport',                'hola@prosport.pe',            'CLIENT', '2026-01-18'),
    ('GlowBeauty',              'contacto@glowbeauty.pe',      'CLIENT', '2026-01-20'),
    ('KidsWorld',               'ventas@kidsworld.pe',         'CLIENT', '2026-01-22'),
    ('MercaFresh',              'pedidos@mercafresh.pe',       'CLIENT', '2026-01-25'),
    -- Postulantes (quedan pendientes en /admin/vendedores)
    ('Andrea Quispe',           'andrea@modaperu.pe',          'CLIENT', '2026-08-28'),
    ('Carlos Ramírez',          'carlos@techstore.pe',         'CLIENT', '2026-08-27'),
    -- Clientes (lib/mock-clients.ts)
    ('María Fernández',         'maria.fernandez@gmail.com',   'CLIENT', '2026-03-12'),
    ('Jorge Salazar',           'jorge.salazar@gmail.com',     'CLIENT', '2026-04-03'),
    ('Lucía Torres',            'lucia.torres@hotmail.com',    'CLIENT', '2026-05-21'),
    ('Diego Huamán',            'diego.huaman@gmail.com',      'CLIENT', '2026-06-09'),
    ('Valeria Rojas',           'valeria.rojas@outlook.com',   'CLIENT', '2026-06-30'),
    ('Renato Vega',             'renato.vega@gmail.com',       'CLIENT', '2026-07-14');

INSERT INTO usuarios (nombre, email, password_hash, proveedor, rol, creado_en)
SELECT nombre, email, crypt('NovaStore2026!', gen_salt('bf', 10)), 'credentials', rol, creado::timestamptz
  FROM _usuarios_demo;

-- -----------------------------------------------------------------------------
-- 3. Vendedores (7 aprobados = una tienda por marca del mock, 2 pendientes)
-- -----------------------------------------------------------------------------
INSERT INTO vendedores (usuario_id, nombre_comercial, razon_social, email_contacto, departamento_id,
                        estado, revisado_por, fecha_solicitud)
SELECT u.id, v.nombre_comercial, v.razon_social, u.email, v.depto, v.estado::estado_vendedor,
       CASE WHEN v.estado = 'aprobado' THEN (SELECT id FROM usuarios WHERE email = 'admin@novastore.pe') END,
       v.fecha::timestamptz
  FROM (VALUES
        ('contacto@soundmax.pe',   'SoundMax Perú', 'SoundMax Perú S.A.C.',      1, 'aprobado',  '2026-01-10'),
        ('ventas@hogarplus.pe',    'HogarPlus',     'HogarPlus E.I.R.L.',        2, 'aprobado',  '2026-01-12'),
        ('hola@urbanwear.pe',      'UrbanWear',     'UrbanWear S.A.C.',          3, 'aprobado',  '2026-01-15'),
        ('hola@prosport.pe',       'ProSport',      'ProSport Perú S.A.C.',      4, 'aprobado',  '2026-01-18'),
        ('contacto@glowbeauty.pe', 'GlowBeauty',    'GlowBeauty S.A.C.',         5, 'aprobado',  '2026-01-20'),
        ('ventas@kidsworld.pe',    'KidsWorld',     'KidsWorld E.I.R.L.',        6, 'aprobado',  '2026-01-22'),
        ('pedidos@mercafresh.pe',  'MercaFresh',    'MercaFresh S.A.C.',         7, 'aprobado',  '2026-01-25'),
        ('andrea@modaperu.pe',     'Moda Perú',     NULL,                        3, 'pendiente', '2026-08-28'),
        ('carlos@techstore.pe',    'TechStore',     NULL,                        1, 'pendiente', '2026-08-27')
       ) AS v(email, nombre_comercial, razon_social, depto, estado, fecha)
  JOIN usuarios u ON u.email = v.email;

-- -----------------------------------------------------------------------------
-- 4. Marcas
-- -----------------------------------------------------------------------------
INSERT INTO marcas (nombre) VALUES
    ('SoundMax'), ('HogarPlus'), ('UrbanWear'), ('ProSport'),
    ('GlowBeauty'), ('KidsWorld'), ('MercaFresh');

-- -----------------------------------------------------------------------------
-- 5. Productos (los 22 de lib/mock-products.ts, mismo orden → ids 1..22)
--    categoria_vendedor_id queda NULL: el mock no registra qué eligió el
--    vendedor, y no se inventa ese dato.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _productos_demo (
    n int, nombre text, precio numeric, precio_original numeric, stock int, marca text,
    tienda text, categoria text, rating numeric, resenas int, envio_gratis bool, es_nuevo bool,
    imagen text, descripcion text
) ON COMMIT DROP;

INSERT INTO _productos_demo VALUES
( 1,'Audífonos Inalámbricos Pro',289.90,349.90,24,'SoundMax','SoundMax Perú','Audio y audífonos',4.6,328,true,false,
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop',
  'Audífonos inalámbricos con cancelación activa de ruido, hasta 30 horas de batería con el estuche de carga y sonido de alta fidelidad ajustado para graves profundos. Ideales para música, llamadas y uso diario en la calle o la oficina.'),
( 2,'Licuadora de Alta Potencia',179.50,NULL,12,'HogarPlus','HogarPlus','Electrodomésticos de cocina',4.3,94,false,false,
  'https://images.unsplash.com/photo-1570222094114-d054a817e56b?q=80&w=800&auto=format&fit=crop',
  'Licuadora de 1200W con vaso de vidrio resistente de 1.8L, 3 velocidades más función pulso y cuchillas de acero inoxidable. Pensada para batidos, jugos y preparaciones espesas sin esfuerzo.'),
( 3,'Chaqueta Impermeable Urbana',249.00,329.00,8,'UrbanWear','UrbanWear','Casacas y abrigos',4.8,156,true,true,
  'https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop',
  'Chaqueta impermeable con costuras selladas, forro térmico ligero y capucha ajustable. Diseñada para uso urbano todo el año, resiste lluvia y viento sin perder estilo.'),
( 4,'Balón de Fútbol Profesional',89.90,NULL,40,'ProSport','ProSport','Balones',4.5,210,false,false,
  'https://images.unsplash.com/photo-1614632537197-38a17061c2bd?q=80&w=800&auto=format&fit=crop',
  'Balón de fútbol de competición, costura termosellada y cámara de látex de alta retención de aire. Aprobado para uso en césped natural y sintético.'),
( 5,'Set de Brochas de Maquillaje',69.90,99.90,60,'GlowBeauty','GlowBeauty','Herramientas de belleza',4.7,412,true,false,
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop',
  'Set de 12 brochas profesionales con cerdas suaves sintéticas, libres de crueldad animal, y estuche de viaje incluido. Cubre rostro y ojos para un maquillaje de acabado uniforme.'),
( 6,'Smartwatch Deportivo',549.00,NULL,15,'SoundMax','SoundMax Perú','Relojes inteligentes y wearables',4.4,87,false,true,
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop',
  'Smartwatch con GPS integrado, monitoreo de ritmo cardíaco 24/7, más de 20 modos deportivos y resistencia al agua 5ATM. Batería de hasta 7 días con notificaciones inteligentes.'),
( 7,'Cafetera Automática',289.00,359.00,18,'HogarPlus','HogarPlus','Electrodomésticos de cocina',4.2,63,false,false,
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800&auto=format&fit=crop',
  'Cafetera automática programable con depósito de 1.5L, filtro permanente reutilizable y placa térmica que mantiene la temperatura. Prepara hasta 12 tazas por ciclo.'),
( 8,'Tenis Running Ligeros',259.90,NULL,30,'ProSport','ProSport','Zapatillas y calzado',4.6,275,true,false,
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
  'Zapatillas running con entresuela de espuma ligera y malla transpirable. Diseñadas para amortiguar el impacto en trotes diarios y entrenamientos largos.'),
( 9,'Perfume Eau de Parfum 100ml',199.90,259.90,22,'GlowBeauty','GlowBeauty','Fragancias',4.9,501,true,false,
  'https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop',
  'Eau de parfum de larga duración con notas florales y amaderadas. Frasco de 100ml, ideal para uso diario o en ocasiones especiales.'),
(10,'Set de Bloques de Construcción',119.90,NULL,45,'KidsWorld','KidsWorld','Bloques de construcción',4.7,132,false,true,
  'https://images.unsplash.com/photo-1587654780291-39c9404d746b?q=80&w=800&auto=format&fit=crop',
  'Set de 350 piezas de bloques de construcción compatibles con las principales marcas del mercado. Estimula la creatividad y motricidad fina, para niños desde 6 años.'),
(11,'Laptop Ultradelgada 14''''',2799.00,3199.00,9,'SoundMax','SoundMax Perú','Laptops y computadoras',4.5,58,true,false,
  'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=800&auto=format&fit=crop',
  'Laptop ultradelgada de 14'''' con procesador de última generación, 16GB de RAM y SSD de 512GB. Pantalla de bordes reducidos y batería de todo el día para trabajo y estudio.'),
(12,'Canasta Familiar de Abarrotes',149.90,NULL,100,'MercaFresh','MercaFresh','Abarrotes y snacks',4.3,76,true,false,
  'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop',
  'Canasta con productos básicos de abarrotes para el hogar: arroz, aceite, azúcar, fideos y más. Pensada para abastecer a una familia durante la semana.'),
(13,'Sofá Modular 3 Cuerpos',1899.00,2299.00,6,'HogarPlus','HogarPlus','Muebles',4.5,41,true,false,
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop',
  'Sofá modular de 3 cuerpos tapizado en tela antimanchas, estructura de madera reforzada y cojines de espuma de alta densidad. Se adapta a espacios pequeños o grandes gracias a su diseño modular.'),
(14,'Set de Velas Aromáticas',59.90,NULL,50,'HogarPlus','HogarPlus','Decoración y menaje',4.6,88,false,false,
  'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?q=80&w=800&auto=format&fit=crop',
  'Set de 3 velas aromáticas en cera de soja, aromas a vainilla, lavanda y madera de cedro. Hasta 30 horas de combustión cada una, ideales para decorar y ambientar cualquier espacio.'),
(15,'Polo Básico Algodón Pima',49.90,NULL,80,'UrbanWear','UrbanWear','Polos y camisas',4.4,203,true,false,
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
  'Polo de algodón pima 100%, corte regular y cuello redondo. Suave al tacto, transpirable y resistente a los lavados frecuentes. Disponible en varios colores.'),
(16,'Conjunto Deportivo Training',129.90,169.90,35,'ProSport','ProSport','Ropa deportiva',4.5,97,false,true,
  'https://images.unsplash.com/photo-1483721310020-03333e577078?q=80&w=800&auto=format&fit=crop',
  'Conjunto deportivo de polera y short en tela dry-fit que absorbe el sudor y se seca rápido. Ideal para entrenar en el gimnasio o al aire libre.'),
(17,'Set de Mancuernas Ajustables',349.90,NULL,14,'ProSport','ProSport','Equipos de fitness',4.7,65,true,false,
  'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?q=80&w=800&auto=format&fit=crop',
  'Par de mancuernas ajustables de 2 a 20 kg cada una, con sistema de cambio rápido de peso. Reemplazan hasta 10 pares de mancuernas fijas.'),
(18,'Paleta de Sombras Profesional',89.90,119.90,40,'GlowBeauty','GlowBeauty','Maquillaje',4.8,176,false,true,
  'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop',
  'Paleta con 18 tonos mate y shimmer, alta pigmentación y larga duración. Incluye tonos neutros y vibrantes para looks de día y de noche.'),
(19,'Oso de Peluche Gigante',79.90,NULL,25,'KidsWorld','KidsWorld','Peluches',4.9,58,true,false,
  'https://images.unsplash.com/photo-1559454403-b8fb88521f11?q=80&w=800&auto=format&fit=crop',
  'Oso de peluche de 80cm, relleno hipoalergénico y tela ultra suave. Un regalo clásico para bebés y niños de cualquier edad.'),
(20,'Auto de Juguete a Control Remoto',99.90,139.90,30,'KidsWorld','KidsWorld','Vehículos de juguete',4.5,84,false,false,
  'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?q=80&w=800&auto=format&fit=crop',
  'Auto a control remoto con batería recargable, velocidad de hasta 15 km/h y neumáticos todo terreno. Incluye control remoto de 2.4GHz.'),
(21,'Pack de Bebidas Rehidratantes',39.90,NULL,120,'MercaFresh','MercaFresh','Bebidas',4.3,47,true,false,
  'https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=800&auto=format&fit=crop',
  'Pack de 12 unidades de bebida rehidratante en sabores surtidos. Repone electrolitos y aporta energía para el día a día o después del ejercicio.'),
(22,'Kit de Limpieza del Hogar',69.90,NULL,55,'MercaFresh','MercaFresh','Limpieza del hogar',4.4,39,false,false,
  'https://images.unsplash.com/photo-1585421514738-01798e348b17?q=80&w=800&auto=format&fit=crop',
  'Kit con desinfectante multiusos, limpiavidrios, paños de microfibra y guantes. Todo lo necesario para una limpieza profunda del hogar.');

INSERT INTO productos (vendedor_id, sku, nombre, descripcion, marca_id, departamento_id, categoria_id,
                       precio, precio_original, stock, envio_gratis, es_nuevo, estado,
                       rating_promedio, num_resenas, revisado_por, creado_en)
SELECT v.id, 'NS-' || lpad(d.n::text, 5, '0'), d.nombre, d.descripcion, m.id, c.departamento_id, c.id,
       d.precio, d.precio_original, d.stock, d.envio_gratis, d.es_nuevo, 'publicado',
       d.rating, d.resenas, (SELECT id FROM usuarios WHERE email = 'catalogo@novastore.pe'),
       timestamptz '2026-02-01' + (d.n || ' days')::interval
  FROM _productos_demo d
  JOIN marcas m      ON m.nombre = d.marca
  JOIN vendedores v  ON v.nombre_comercial = d.tienda
  JOIN categorias c  ON c.nombre = d.categoria
 ORDER BY d.n;

INSERT INTO producto_imagenes (producto_id, url, es_principal, orden)
SELECT p.id, d.imagen, true, 0
  FROM _productos_demo d
  JOIN productos p ON p.sku = 'NS-' || lpad(d.n::text, 5, '0');

-- -----------------------------------------------------------------------------
-- 6. Modelos de IA planificados en el T1 (sin métricas: se llenan al entrenar)
-- -----------------------------------------------------------------------------
INSERT INTO modelos_ia (codigo, caso_uso, tipo, arquitectura, dimension_embedding, num_clases, hiperparametros, estado) VALUES
    ('cu1-resnet50-v1',        'CU1', 'imagen', 'ResNet-50 (ImageNet) + fine-tuning',        2048, 21,
        '{"pesos_base": "torchvision IMAGENET1K_V2", "tamano_imagen": 224}', 'planificado'),
    ('cu1-efficientnet-b0-v1', 'CU1', 'imagen', 'EfficientNet-B0 (ImageNet) + fine-tuning',  1280, 21,
        '{"pesos_base": "torchvision IMAGENET1K_V1", "tamano_imagen": 224}', 'planificado'),
    ('cu2-tfidf-logreg-v1',    'CU2', 'texto',  'TF-IDF + Regresión logística (baseline)',   NULL, 21,
        '{"ngram_range": [1, 2]}', 'planificado'),
    ('cu2-beto-v1',            'CU2', 'texto',  'BETO (BERT en español) + fine-tuning',       768, 21,
        '{"modelo_base": "dccuchile/bert-base-spanish-wwm-cased", "max_length": 128}', 'planificado');

-- -----------------------------------------------------------------------------
-- 7. Direcciones y pedidos de ejemplo (usan fn_crear_pedido, así se prueban
--    stock, precios y envío). Son datos de demostración.
-- -----------------------------------------------------------------------------
INSERT INTO direcciones (usuario_id, alias, nombre_destinatario, direccion, distrito, ciudad, telefono, es_predeterminada)
SELECT id, 'Casa', nombre, x.dir, x.distrito, 'Lima', x.tel, true
  FROM usuarios u
  JOIN (VALUES ('maria.fernandez@gmail.com', 'Av. Arequipa 1450, Dpto. 302', 'Lince',       '987654321'),
               ('jorge.salazar@gmail.com',   'Jr. Las Begonias 220',         'San Isidro',  '912345678'),
               ('lucia.torres@hotmail.com',  'Calle Los Pinos 85',           'Miraflores',  '998877665'))
       AS x(email, dir, distrito, tel) ON x.email = u.email;

DO $$
DECLARE
    v_maria uuid := (SELECT id FROM novastore.usuarios WHERE email = 'maria.fernandez@gmail.com');
    v_jorge uuid := (SELECT id FROM novastore.usuarios WHERE email = 'jorge.salazar@gmail.com');
    v_lucia uuid := (SELECT id FROM novastore.usuarios WHERE email = 'lucia.torres@hotmail.com');
    v_p     novastore.pedidos;
BEGIN
    v_p := novastore.fn_crear_pedido(v_maria, '[{"producto_id":1,"cantidad":1},{"producto_id":9,"cantidad":1}]',
                                     'tarjeta', 'María Fernández', 'Av. Arequipa 1450, Dpto. 302', 'Lima', '987654321');
    UPDATE novastore.pedidos SET estado = 'en_camino' WHERE id = v_p.id;
    UPDATE novastore.pedidos SET estado = 'entregado' WHERE id = v_p.id;
    UPDATE novastore.pagos   SET estado = 'aprobado'  WHERE pedido_id = v_p.id;

    v_p := novastore.fn_crear_pedido(v_jorge, '[{"producto_id":15,"cantidad":2}]',
                                     'yape_plin', 'Jorge Salazar', 'Jr. Las Begonias 220', 'Lima', '912345678');
    UPDATE novastore.pagos SET estado = 'aprobado' WHERE pedido_id = v_p.id;

    v_p := novastore.fn_crear_pedido(v_lucia, '[{"producto_id":13,"cantidad":1},{"producto_id":14,"cantidad":2}]',
                                     'contraentrega', 'Lucía Torres', 'Calle Los Pinos 85', 'Lima', '998877665');
    UPDATE novastore.pedidos SET estado = 'en_camino' WHERE id = v_p.id;
END $$;

COMMIT;

SELECT 'Datos iniciales cargados.' AS resultado;
SELECT 'departamentos' AS tabla, count(*) FROM departamentos
UNION ALL SELECT 'categorias', count(*) FROM categorias
UNION ALL SELECT 'usuarios',   count(*) FROM usuarios
UNION ALL SELECT 'vendedores', count(*) FROM vendedores
UNION ALL SELECT 'productos',  count(*) FROM productos
UNION ALL SELECT 'pedidos',    count(*) FROM pedidos
UNION ALL SELECT 'modelos_ia', count(*) FROM modelos_ia;

-- ############################################################################
-- PARTE 3 — PRUEBAS AUTOMÁTICAS (todo se revierte con ROLLBACK)
--   Los mensajes 'OK 1' … 'OK 14' aparecen en la salida (pgAdmin: pestaña Messages).
-- ############################################################################
SET search_path = novastore, public;
SET client_min_messages = notice;

BEGIN;

-- 1. La vista de la tienda devuelve la forma del tipo Product del frontend
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM v_productos_tienda WHERE id = '1';
    ASSERT r.nombre = 'Audífonos Inalámbricos Pro', 'nombre incorrecto';
    ASSERT r.categoria_ia = 'Audio y audífonos', 'categoria_ia incorrecta';
    ASSERT r.imagen_url LIKE 'https://%', 'falta imagen principal';
    ASSERT (SELECT count(*) FROM v_productos_tienda) = 22, 'se esperaban 22 productos publicados';
    RAISE NOTICE 'OK 1  vista v_productos_tienda';
END $$;

-- 2. Checkout: precio desde la BD, descuento de stock y envío gratis >= S/199
DO $$
DECLARE
    v_cliente uuid := (SELECT id FROM usuarios WHERE email = 'diego.huaman@gmail.com');
    v_stock_antes int := (SELECT stock FROM productos WHERE id = 4);
    v_p pedidos;
BEGIN
    v_p := fn_crear_pedido(v_cliente, '[{"producto_id":4,"cantidad":3}]', 'tarjeta',
                           'Diego Huamán', 'Av. Test 123', 'Lima', '900000000');
    ASSERT v_p.subtotal = 269.70, format('subtotal esperado 269.70, obtenido %s', v_p.subtotal);
    ASSERT v_p.costo_envio = 0,   'debería tener envío gratis';
    ASSERT v_p.codigo LIKE 'PED-%', 'código de pedido inválido';
    ASSERT (SELECT stock FROM productos WHERE id = 4) = v_stock_antes - 3, 'no descontó stock';
    ASSERT (SELECT count(*) FROM pagos WHERE pedido_id = v_p.id AND estado = 'pendiente') = 1, 'no registró el pago';

    v_p := fn_crear_pedido(v_cliente, '[{"producto_id":21,"cantidad":1}]', 'yape_plin',
                           'Diego Huamán', 'Av. Test 123', 'Lima', '900000000');
    ASSERT v_p.costo_envio = 15 AND v_p.total = 54.90, 'debería cobrar envío (S/ 15)';
    RAISE NOTICE 'OK 2  checkout, stock y envío';
END $$;

-- 3. No se puede vender más de lo que hay en stock
DO $$
DECLARE v_cliente uuid := (SELECT id FROM usuarios WHERE email = 'diego.huaman@gmail.com');
BEGIN
    PERFORM fn_crear_pedido(v_cliente, '[{"producto_id":13,"cantidad":999}]', 'tarjeta',
                            'Diego', 'Av. Test 123', 'Lima', '900000000');
    RAISE EXCEPTION 'FALLO: permitió sobreventa';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 3  bloqueo de sobreventa (%)', SQLERRM;
END $$;

-- 4. Cancelar un pedido devuelve el stock y queda en el historial
DO $$
DECLARE
    v_pedido bigint := (SELECT id FROM pedidos WHERE codigo = 'PED-10000002');
    v_stock_antes int := (SELECT stock FROM productos WHERE id = 15);
BEGIN
    UPDATE pedidos SET estado = 'cancelado' WHERE id = v_pedido;
    ASSERT (SELECT stock FROM productos WHERE id = 15) = v_stock_antes + 2, 'no devolvió stock';
    ASSERT (SELECT count(*) FROM pedido_estados_historial
             WHERE pedido_id = v_pedido AND estado_nuevo = 'cancelado') = 1, 'no guardó historial';
    RAISE NOTICE 'OK 4  cancelación devuelve stock';
END $$;

-- 5. Un pedido entregado ya no cambia de estado
DO $$
BEGIN
    UPDATE pedidos SET estado = 'pendiente' WHERE codigo = 'PED-10000001';
    RAISE EXCEPTION 'FALLO: permitió reabrir un pedido entregado';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 5  pedido entregado es final';
END $$;

-- 6. Un vendedor pendiente no puede publicar
DO $$
DECLARE v_pend uuid := (SELECT id FROM vendedores WHERE nombre_comercial = 'Moda Perú');
BEGIN
    INSERT INTO productos (vendedor_id, nombre, marca_id, departamento_id, categoria_id, precio, estado)
    VALUES (v_pend, 'Casaca de prueba', 1, 3, 7, 100, 'publicado');
    RAISE EXCEPTION 'FALLO: publicó con vendedor pendiente';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 6  vendedor pendiente no publica';
END $$;

-- 7. La categoría debe pertenecer al departamento (Moda + "Balones" no vale)
DO $$
DECLARE v_vend uuid := (SELECT id FROM vendedores WHERE nombre_comercial = 'UrbanWear');
BEGIN
    INSERT INTO productos (vendedor_id, nombre, marca_id, departamento_id, categoria_id, precio)
    VALUES (v_vend, 'Producto incoherente', 3, 3, 10, 50);
    RAISE EXCEPTION 'FALLO: aceptó categoría de otro departamento';
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK 7  categoría coherente con departamento';
END $$;

-- 8. Flujo IA completo: alta → predicción → revisión del analista → publicado
DO $$
DECLARE
    v_vend     uuid     := (SELECT id FROM vendedores WHERE nombre_comercial = 'UrbanWear');
    v_analista uuid     := (SELECT id FROM usuarios WHERE email = 'catalogo@novastore.pe');
    v_modelo   smallint := (SELECT id FROM modelos_ia WHERE codigo = 'cu1-resnet50-v1');
    v_prod     bigint;
    v_img      bigint;
    v_pred     bigint;
BEGIN
    -- El vendedor eligió "Polos y camisas" (9) pero en realidad es una casaca.
    INSERT INTO productos (vendedor_id, nombre, descripcion, marca_id, departamento_id,
                           categoria_vendedor_id, precio, stock)
    VALUES (v_vend, 'Casaca Rompevientos Negra', 'Casaca ligera con capucha', 3, 3, 9, 159.90, 10)
    RETURNING id INTO v_prod;

    INSERT INTO producto_imagenes (producto_id, url, es_principal)
    VALUES (v_prod, 'https://novastore.blob.core.windows.net/productos/test.jpg', true)
    RETURNING id INTO v_img;

    INSERT INTO predicciones_ia (producto_id, modelo_id, imagen_id, categoria_predicha_id, confianza, top_k, latencia_ms)
    VALUES (v_prod, v_modelo, v_img, 7, 0.9312,
            '[{"categoria_id":7,"prob":0.9312},{"categoria_id":9,"prob":0.0420}]', 180)
    RETURNING id INTO v_pred;

    INSERT INTO revisiones_categoria (producto_id, prediccion_id, categoria_sugerida_id,
                                      categoria_final_id, accion, revisado_por, tiempo_revision_seg)
    VALUES (v_prod, v_pred, 7, 7, 'aceptada', v_analista, 45);

    ASSERT (SELECT categoria_id FROM productos WHERE id = v_prod) = 7, 'la revisión no fijó la categoría';

    UPDATE productos SET estado = 'publicado' WHERE id = v_prod;
    ASSERT (SELECT publicado_en IS NOT NULL FROM productos WHERE id = v_prod), 'falta publicado_en';

    ASSERT (SELECT fichas_revisadas FROM v_metricas_clasificacion WHERE modelo = 'cu1-resnet50-v1') = 1;
    ASSERT (SELECT pct_error_vendedor FROM v_linea_base_categorizacion) = 100.00;
    RAISE NOTICE 'OK 8  flujo de clasificación y métricas';
END $$;

-- 9. Revisión incoherente: "aceptada" con categoría distinta a la sugerida
DO $$
DECLARE v_analista uuid := (SELECT id FROM usuarios WHERE email = 'catalogo@novastore.pe');
BEGIN
    INSERT INTO revisiones_categoria (producto_id, categoria_sugerida_id, categoria_final_id, accion, revisado_por)
    VALUES (1, 1, 2, 'aceptada', v_analista);
    RAISE EXCEPTION 'FALLO: aceptó revisión incoherente';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 9  revisión coherente';
END $$;

-- 10. Embeddings: valida dimensión y encuentra duplicados por similitud coseno
DO $$
DECLARE
    v_beto smallint := (SELECT id FROM modelos_ia WHERE codigo = 'cu2-beto-v1');
    v_base float4[];
    v_top  record;
BEGIN
    SELECT array_agg(random()::float4) INTO v_base FROM generate_series(1, 768);
    INSERT INTO producto_embeddings (producto_id, modelo_id, fuente, embedding)
    VALUES (1, v_beto, 'texto', v_base::vector),
           -- producto 6: casi igual al 1 (pequeño ruido) → candidato a duplicado
           (6, v_beto, 'texto', (SELECT array_agg(x + (random()::float4 - 0.5) * 0.01) FROM unnest(v_base) x)::vector),
           -- producto 11: vector no relacionado
           (11, v_beto, 'texto', (SELECT array_agg(random()::float4 - 0.5) FROM generate_series(1, 768))::vector);

    SELECT * INTO v_top FROM fn_buscar_duplicados(1, v_beto, 0.90, 5) LIMIT 1;
    ASSERT v_top.producto_id = 6, 'no encontró el duplicado esperado';
    ASSERT (SELECT count(*) FROM fn_buscar_duplicados(1, v_beto, 0.90, 5)) = 1, 'devolvió falsos positivos';

    BEGIN
        INSERT INTO producto_embeddings (producto_id, modelo_id, fuente, embedding)
        VALUES (2, v_beto, 'texto', '[1,2,3]');
        RAISE EXCEPTION 'FALLO: aceptó un vector de 3 dimensiones para BETO';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
    END;

    INSERT INTO duplicados_detectados (producto_a_id, producto_b_id, similitud_texto, similitud_combinada, umbral_usado, estado)
    VALUES (1, 6, v_top.similitud, v_top.similitud, 0.90, 'confirmado');
    ASSERT (SELECT precision_pct FROM v_metricas_duplicados) = 100.00;
    RAISE NOTICE 'OK 10 embeddings y detección de duplicados (similitud %)', v_top.similitud;
END $$;

-- 11. Aprobar a un vendedor le da rol SELLER automáticamente
DO $$
BEGIN
    UPDATE vendedores SET estado = 'aprobado' WHERE nombre_comercial = 'TechStore';
    ASSERT (SELECT rol FROM usuarios WHERE email = 'carlos@techstore.pe') = 'SELLER', 'no cambió el rol';
    RAISE NOTICE 'OK 11 aprobación de vendedor → rol SELLER';
END $$;

-- 12. Reseñas actualizan el rating de forma incremental
DO $$
DECLARE v_cliente uuid := (SELECT id FROM usuarios WHERE email = 'renato.vega@gmail.com');
BEGIN
    INSERT INTO resenas (producto_id, cliente_id, calificacion) VALUES (19, v_cliente, 1);
    ASSERT (SELECT num_resenas FROM productos WHERE id = 19) = 59, 'no sumó la reseña';
    ASSERT (SELECT rating_promedio FROM productos WHERE id = 19) = 4.8, 'rating mal calculado';
    RAISE NOTICE 'OK 12 reseñas y rating';
END $$;

-- 13. Contraseñas demo verificables (bcrypt)
DO $$
BEGIN
    ASSERT (SELECT password_hash = crypt('NovaStore2026!', password_hash)
              FROM usuarios WHERE email = 'admin@novastore.pe'), 'hash bcrypt inválido';
    ASSERT (SELECT password_hash LIKE '$2a$%' FROM usuarios WHERE email = 'admin@novastore.pe');
    RAISE NOTICE 'OK 13 contraseñas bcrypt';
END $$;

-- 14. Búsqueda: texto completo en español y sin tildes
DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM v_productos_tienda
                    WHERE busqueda @@ websearch_to_tsquery('spanish', 'audífonos inalámbricos')), 'FTS falló';
    ASSERT EXISTS (SELECT 1 FROM productos
                    WHERE f_unaccent(lower(nombre)) LIKE '%' || f_unaccent(lower('audifonos')) || '%'), 'búsqueda sin tildes falló';
    RAISE NOTICE 'OK 14 búsqueda';
END $$;

ROLLBACK;
SELECT 'Todas las pruebas pasaron. (Se hizo ROLLBACK: la base quedó igual que antes.)' AS resultado;

-- ############################################################################
-- PARTE 4 — (OPCIONAL) USUARIOS DE BASE DE DATOS CON PERMISOS MÍNIMOS
--   · novastore_app      → backend FastAPI (lee/escribe datos, no cambia el esquema)
--   · novastore_lectura  → equipo de ML / reportes (solo lectura, sin tabla usuarios)
--   Para usarla: reemplaza las dos contraseñas, quita los "--" de las líneas
--   de abajo y ejecuta SOLO este bloque. No dejes las contraseñas de ejemplo.
-- ############################################################################
-- CREATE ROLE novastore_app     LOGIN PASSWORD 'CAMBIAR-clave-backend'  CONNECTION LIMIT 20;
-- CREATE ROLE novastore_lectura LOGIN PASSWORD 'CAMBIAR-clave-lectura'  CONNECTION LIMIT 5;
-- ALTER ROLE novastore_app     SET search_path = novastore, public;
-- ALTER ROLE novastore_lectura SET search_path = novastore, public;
-- GRANT CONNECT ON DATABASE novastore_db TO novastore_app, novastore_lectura;
-- GRANT USAGE ON SCHEMA novastore TO novastore_app, novastore_lectura;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA novastore TO novastore_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA novastore TO novastore_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA novastore TO novastore_app;
-- GRANT SELECT ON ALL TABLES IN SCHEMA novastore TO novastore_lectura;
-- REVOKE SELECT ON novastore.usuarios FROM novastore_lectura;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA novastore GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO novastore_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA novastore GRANT USAGE, SELECT ON SEQUENCES TO novastore_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA novastore GRANT EXECUTE ON FUNCTIONS TO novastore_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA novastore GRANT SELECT ON TABLES TO novastore_lectura;

-- Fin del script.
