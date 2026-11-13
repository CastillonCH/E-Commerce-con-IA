-- =============================================================================
--  004_carga_asistida.sql
--
--  "La IA primero": quien carga un producto ve la sugerencia de la IA
--  ANTES de guardar y solo confirma o corrige. Para demostrar el ahorro de
--  tiempo, cada ficha guarda cuánto tardó en cargarse y en qué modo.
--
--  Qué cambia:
--    · productos.creado_por: quién del personal cargó la ficha.
--    · productos.modo_carga:
--        'manual'   = eligió la categoría sin ver a la IA (modo experimento,
--                     o la IA no respondió). Es la línea base del error humano.
--        'asistido' = la IA propuso y la persona confirmó o corrigió.
--        NULL       = fichas anteriores a esta medición (seed, históricos).
--    · productos.tiempo_carga_seg: desde que empezó a llenar el formulario
--      hasta que guardó.
--    · productos.sugerencia_aceptada: en modo asistido, si se quedó con la
--      categoría que propuso la IA (true) o la cambió (false).
--    · v_linea_base_categorizacion ya no cuenta las fichas asistidas: la
--      línea base solo vale si la persona eligió sin ver la sugerencia.
--    · fn_metricas_carga(usuario): tiempo y error por modo, de todos o de
--      una persona (lo usa /admin/modelos y el formulario de carga).
--
--  Para quién: bases que ya tienen aplicada la 003. Una base creada desde
--  cero con db/novastore_postgresql.sql ya viene así.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/004_carga_asistida.sql
--  Todo-o-nada; si ya se aplicó, se detiene sin tocar nada.
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'novastore' AND table_name = 'productos'
                  AND column_name = 'modo_carga') THEN
        RAISE EXCEPTION 'La migración 004 ya está aplicada. No se cambió nada.';
    END IF;
END $$;

CREATE TYPE modo_carga AS ENUM ('manual', 'asistido');

ALTER TABLE productos
    ADD COLUMN creado_por          uuid       REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN modo_carga          modo_carga,
    ADD COLUMN tiempo_carga_seg    integer    CHECK (tiempo_carga_seg BETWEEN 1 AND 7200),
    ADD COLUMN sugerencia_aceptada boolean,
    ADD CONSTRAINT ck_productos_sugerencia_solo_asistido
        CHECK (sugerencia_aceptada IS NULL OR modo_carga = 'asistido');
CREATE INDEX ix_productos_creado_por ON productos (creado_por);

COMMENT ON COLUMN productos.creado_por IS 'Quién del personal cargó la ficha.';
COMMENT ON COLUMN productos.modo_carga IS 'manual = eligió sin ver a la IA (línea base); asistido = la IA propuso y la persona confirmó; NULL = ficha anterior a la medición.';
COMMENT ON COLUMN productos.tiempo_carga_seg IS 'Segundos desde que empezó a llenar el formulario hasta que guardó.';
COMMENT ON COLUMN productos.sugerencia_aceptada IS 'Solo en modo asistido: true si se quedó con la categoría que propuso la IA.';

CREATE OR REPLACE VIEW v_linea_base_categorizacion AS
SELECT count(*)                                                                AS productos_con_categoria_final,
       count(*) FILTER (WHERE categoria_manual_id IS NOT NULL)                 AS con_categoria_manual,
       count(*) FILTER (WHERE categoria_manual_id <> categoria_id)             AS mal_categorizados_manual,
       round(100.0 * count(*) FILTER (WHERE categoria_manual_id <> categoria_id)
             / nullif(count(*) FILTER (WHERE categoria_manual_id IS NOT NULL), 0), 2) AS pct_error_manual
  FROM productos
 WHERE categoria_id IS NOT NULL
   AND modo_carga IS DISTINCT FROM 'asistido';

-- Tiempo de carga y error de categoría por modo. p_usuario NULL = todo el
-- personal. "Error" compara la categoría que dejó quien cargó con la
-- categoría final confirmada.
CREATE FUNCTION fn_metricas_carga(p_usuario uuid DEFAULT NULL)
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
       AND (p_usuario IS NULL OR p.creado_por = p_usuario)
     GROUP BY p.modo_carga
     ORDER BY p.modo_carga
$$;

COMMIT;

SELECT 'Migración 004 aplicada: carga asistida por IA y tiempo de carga.' AS resultado;
