-- =============================================================================
--  006_proceso_sin_ia_vs_con_ia.sql
--
--  Mide el PROCESO COMPLETO de catalogación (carga + revisión) sin IA y con
--  IA, y lo compara contra una categoría correcta que nadie influyó.
--
--  Qué cambia:
--    · productos.categoria_ia_id / confianza_ia: la sugerencia de la IA
--      (resultado fusionado imagen + texto), la misma que ve quien carga.
--      En una ficha "sin IA" se calcula igual pero NO se muestra a nadie:
--      sirve para comparar a la persona con la IA en las mismas fichas.
--    · productos.ia_no_disponible: estaba en modo "con IA" pero no llegó a
--      ver la sugerencia (la IA no respondió, o guardó antes de que
--      llegara). Esa ficha queda fuera de la medición: no es ni una cosa
--      ni la otra.
--    · productos.auto_publicado: la IA la publicó sola al cargarla (solo
--      "con IA"). Una ficha "sin IA" siempre pasa por revisión.
--    · revisiones_categoria.origen_sugerencia: qué vio el revisor como
--      propuesta: la categoría de la IA ('ia') o la que eligió quien cargó
--      la ficha ('persona', fichas sin IA). Y el modo de carga de la ficha.
--    · rechazos_revision: los rechazos ahora también guardan el tiempo que
--      tomó decidir (antes no quedaba registro).
--    · experimento_fichas: la lista del experimento (productos del conjunto
--      de PRUEBA del dataset) con su categoría correcta conocida. Nadie la
--      ve en la carga ni en la revisión; al guardar una ficha con el mismo
--      nombre, queda enlazada.
--    · v_sugerencia_revision: la propuesta que ve el revisor, según el modo.
--    · v_primera_decision: la primera revisión o rechazo de cada ficha (si
--      se rechaza y se reenvía, cuenta la primera).
--    · fn_metricas_proceso(): tiempo de carga, de revisión y total, % que
--      va a revisión y % de error contra la referencia, por modo.
--    · fn_metricas_carga deja fuera las fichas con la IA caída.
--
--  Para quién: bases que ya tienen aplicada la 005. Una base creada desde
--  cero con db/novastore_postgresql.sql ya viene así.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/006_proceso_sin_ia_vs_con_ia.sql
--  Todo-o-nada; si ya se aplicó, se detiene sin tocar nada.
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'novastore' AND table_name = 'usuarios'
                      AND column_name = 'modo_carga') THEN
        RAISE EXCEPTION 'Falta la migración 005 (usuarios.modo_carga). Aplícala primero.';
    END IF;
    IF to_regclass('novastore.experimento_fichas') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 006 ya está aplicada. No se cambió nada.';
    END IF;
END $$;

-- @@CUERPO@@ (lo mismo va en db/novastore_postgresql.sql)
CREATE TYPE origen_sugerencia AS ENUM ('ia', 'persona');

ALTER TABLE productos
    ADD COLUMN categoria_ia_id   smallint     REFERENCES categorias(id),
    ADD COLUMN confianza_ia      numeric(5,4) CHECK (confianza_ia BETWEEN 0 AND 1),
    ADD COLUMN ia_no_disponible  boolean      NOT NULL DEFAULT false,
    ADD COLUMN auto_publicado    boolean      NOT NULL DEFAULT false;
COMMENT ON COLUMN productos.categoria_ia_id IS 'Sugerencia de la IA (fusión imagen + texto). En fichas sin IA se guarda pero no se muestra.';
COMMENT ON COLUMN productos.ia_no_disponible IS 'Modo con IA pero no vio la sugerencia (la IA no respondió o guardó antes de que llegara): fuera de la medición.';
COMMENT ON COLUMN productos.auto_publicado IS 'La IA la publicó sola al cargarla, sin revisión humana.';

ALTER TABLE revisiones_categoria
    ADD COLUMN origen_sugerencia origen_sugerencia NOT NULL DEFAULT 'ia',
    ADD COLUMN modo_carga        modo_carga;
COMMENT ON COLUMN revisiones_categoria.origen_sugerencia IS 'ia = el revisor vio la categoría de la IA; persona = vio la que eligió quien cargó (ficha sin IA).';

CREATE TABLE rechazos_revision (
    id                   bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id          bigint      NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    revisado_por         uuid        NOT NULL REFERENCES usuarios(id),
    motivo               text        NOT NULL CHECK (length(btrim(motivo)) >= 5),
    tiempo_revision_seg  integer     CHECK (tiempo_revision_seg >= 0),
    modo_carga           modo_carga,
    creado_en            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_rechazos_producto ON rechazos_revision (producto_id, creado_en);

-- Lista del experimento: fichas del conjunto de PRUEBA del dataset (no se
-- usaron para entrenar) con su categoría correcta. La llena
-- ml/experimento/preparar_experimento.py.
CREATE TABLE experimento_fichas (
    codigo                   varchar(12)  PRIMARY KEY,                -- EXP-001
    grupo                    char(1)      NOT NULL CHECK (grupo IN ('A', 'B')),
    nombre                   varchar(200) NOT NULL CHECK (length(btrim(nombre)) >= 2),
    categoria_referencia_id  smallint     NOT NULL REFERENCES categorias(id),
    fuente                   varchar(60)  NOT NULL,                   -- p. ej. 'test.csv#4515'
    producto_id              bigint       UNIQUE REFERENCES productos(id) ON DELETE SET NULL,
    creado_en                timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_experimento_nombre ON experimento_fichas (lower(btrim(nombre)));
COMMENT ON TABLE experimento_fichas IS 'Categoría correcta conocida para medir el error. No se muestra en la carga ni en la revisión.';

-- Qué ve el revisor como propuesta. Ficha sin IA → la categoría que eligió
-- la persona (sin pista de la IA). Con IA → la sugerencia fusionada; las
-- fichas anteriores a la 006 usan la predicción más segura de un modelo.
CREATE VIEW v_sugerencia_revision AS
SELECT p.id AS producto_id,
       s.origen,
       CASE s.origen WHEN 'persona' THEN p.categoria_manual_id
                     ELSE coalesce(p.categoria_ia_id, pred.categoria_predicha_id) END AS categoria_sugerida_id,
       CASE s.origen WHEN 'ia' THEN coalesce(p.confianza_ia, pred.confianza) END    AS confianza,
       CASE s.origen WHEN 'ia' THEN pred.id END                                       AS prediccion_id
  FROM productos p
  LEFT JOIN LATERAL (
      SELECT * FROM predicciones_ia WHERE producto_id = p.id ORDER BY confianza DESC NULLS LAST, id LIMIT 1
  ) pred ON true
  CROSS JOIN LATERAL (
      SELECT CASE
                 WHEN p.modo_carga = 'manual' AND p.categoria_manual_id IS NOT NULL THEN 'persona'
                 WHEN coalesce(p.categoria_ia_id, pred.categoria_predicha_id) IS NOT NULL THEN 'ia'
                 WHEN p.categoria_manual_id IS NOT NULL THEN 'persona'
             END::origen_sugerencia AS origen
  ) s;

-- Primera decisión del revisor sobre cada ficha (aprobó o rechazó).
CREATE VIEW v_primera_decision AS
SELECT DISTINCT ON (producto_id)
       producto_id, tipo, accion, tiempo_revision_seg, revisado_por, origen_sugerencia, creado_en
  FROM (
      SELECT r.producto_id, 'revision'::text AS tipo, r.accion::text AS accion, r.tiempo_revision_seg,
             r.revisado_por, r.origen_sugerencia, r.creado_en, r.id
        FROM revisiones_categoria r
      UNION ALL
      SELECT x.producto_id, 'rechazo', 'rechazada', x.tiempo_revision_seg,
             x.revisado_por, NULL, x.creado_en, x.id
        FROM rechazos_revision x
  ) d
 ORDER BY producto_id, creado_en, id;

-- Proceso completo por modo. Cuenta solo la carga original (no ediciones
-- posteriores), deja fuera las fichas con la IA caída y las que revisó la
-- misma persona que las cargó. p_solo_experimento = solo las fichas
-- enlazadas a experimento_fichas.
CREATE FUNCTION fn_metricas_proceso(p_solo_experimento boolean DEFAULT false)
RETURNS TABLE (
    modo                     modo_carga,
    fichas                   integer,
    seg_carga_mediana        numeric,
    pct_a_revision           numeric,
    revisadas                integer,
    seg_revision_mediana     numeric,
    seg_proceso_mediana      numeric,
    pct_correcciones         numeric,
    con_referencia           integer,
    pct_error_carga          numeric,
    pct_error_ia             numeric,
    pct_error_publicado      numeric
)
LANGUAGE sql STABLE
SET search_path = novastore, public
AS $$
    WITH f AS (
        SELECT p.modo_carga, p.tiempo_carga_seg, p.auto_publicado, p.estado,
               p.categoria_manual_id, p.categoria_id, p.categoria_ia_id,
               d.tipo, d.accion, d.tiempo_revision_seg,
               coalesce(d.revisado_por = p.creado_por, false) AS autorrevision,
               e.categoria_referencia_id AS ref
          FROM productos p
          LEFT JOIN v_primera_decision d ON d.producto_id = p.id AND NOT p.auto_publicado
          LEFT JOIN experimento_fichas e ON e.producto_id = p.id
         WHERE p.modo_carga IS NOT NULL
           AND NOT p.ia_no_disponible
           AND (NOT p_solo_experimento OR e.producto_id IS NOT NULL)
    ), g AS (
        SELECT f.*,
               (f.tipo IS NOT NULL AND NOT f.autorrevision) AS decision_valida,
               CASE WHEN f.auto_publicado THEN f.tiempo_carga_seg
                    WHEN f.tipo IS NOT NULL AND NOT f.autorrevision
                        THEN f.tiempo_carga_seg + f.tiempo_revision_seg
               END AS seg_proceso
          FROM f
    )
    SELECT g.modo_carga,
           count(*)::int,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY g.tiempo_carga_seg))::numeric, 1),
           round(100.0 * count(*) FILTER (WHERE NOT g.auto_publicado) / count(*), 2),
           count(*) FILTER (WHERE g.decision_valida)::int,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY g.tiempo_revision_seg)
                  FILTER (WHERE g.decision_valida))::numeric, 1),
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY g.seg_proceso))::numeric, 1),
           round(100.0 * count(*) FILTER (WHERE g.decision_valida AND g.accion = 'corregida')
                 / nullif(count(*) FILTER (WHERE g.decision_valida AND g.tipo = 'revision'), 0), 2),
           count(*) FILTER (WHERE g.ref IS NOT NULL)::int,
           round(100.0 * count(*) FILTER (WHERE g.ref IS NOT NULL AND g.categoria_manual_id IS DISTINCT FROM g.ref)
                 / nullif(count(*) FILTER (WHERE g.ref IS NOT NULL), 0), 2),
           round(100.0 * count(*) FILTER (WHERE g.ref IS NOT NULL AND g.categoria_ia_id <> g.ref)
                 / nullif(count(*) FILTER (WHERE g.ref IS NOT NULL AND g.categoria_ia_id IS NOT NULL), 0), 2),
           round(100.0 * count(*) FILTER (WHERE g.ref IS NOT NULL AND g.estado = 'publicado' AND g.categoria_id <> g.ref)
                 / nullif(count(*) FILTER (WHERE g.ref IS NOT NULL AND g.estado = 'publicado' AND g.categoria_id IS NOT NULL), 0), 2)
      FROM g
     GROUP BY g.modo_carga
     ORDER BY g.modo_carga
$$;

-- La IA caída no cuenta como "sin IA" ni como "con IA".
CREATE OR REPLACE FUNCTION fn_metricas_carga(p_usuario uuid DEFAULT NULL)
RETURNS TABLE (
    modo                      modo_carga,
    fichas                    integer,
    seg_promedio              numeric,
    seg_mediana               numeric,
    con_categoria_final       integer,
    mal_categorizadas         integer,
    pct_error                 numeric,
    pct_sugerencias_aceptadas numeric
)
LANGUAGE sql STABLE
SET search_path = novastore, public
AS $$
    SELECT p.modo_carga,
           count(*)::int,
           round(avg(p.tiempo_carga_seg), 1),
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY p.tiempo_carga_seg))::numeric, 1),
           count(*) FILTER (WHERE p.categoria_id IS NOT NULL)::int,
           count(*) FILTER (WHERE p.categoria_manual_id <> p.categoria_id)::int,
           round(100.0 * count(*) FILTER (WHERE p.categoria_manual_id <> p.categoria_id)
                 / nullif(count(*) FILTER (WHERE p.categoria_id IS NOT NULL), 0), 2),
           round(100.0 * count(*) FILTER (WHERE p.sugerencia_aceptada)
                 / nullif(count(*) FILTER (WHERE p.sugerencia_aceptada IS NOT NULL), 0), 2)
      FROM productos p
     WHERE p.modo_carga IS NOT NULL
       AND NOT p.ia_no_disponible
       AND (p_usuario IS NULL OR p.creado_por = p_usuario)
     GROUP BY p.modo_carga
     ORDER BY p.modo_carga
$$;
-- @@FIN@@

COMMIT;

SELECT 'Migración 006 aplicada: proceso sin IA vs con IA, con referencia.' AS resultado;
