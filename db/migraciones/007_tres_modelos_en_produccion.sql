-- =============================================================================
--  007_tres_modelos_en_produccion.sql
--
--  La sugerencia de la tienda combina TRES modelos a la vez: el promedio de
--  ResNet-50 y EfficientNet-B0 (imagen) con BETO (texto), más la fusión que
--  los junta. La regla anterior ("un solo modelo en producción por tipo")
--  impedía marcar a las dos redes de imagen como en producción, aunque el
--  microservicio ya usaba las dos.
--
--  Qué cambia:
--    · Se quita ux_modelos_ia_en_produccion. Cuáles están en producción lo
--      registra ml/registrar_metricas.py, junto con las métricas de
--      validación (val_*) y de prueba (test_*).
--
--  Para quién: bases que ya tienen aplicada la 006. Una base creada desde
--  cero con db/novastore_postgresql.sql ya viene así.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/007_tres_modelos_en_produccion.sql
--  Si ya se aplicó, se detiene sin tocar nada.
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

DO $$
BEGIN
    IF to_regclass('novastore.experimento_fichas') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 006. Aplícala primero.';
    END IF;
    IF to_regclass('novastore.ux_modelos_ia_en_produccion') IS NULL THEN
        RAISE EXCEPTION 'La migración 007 ya está aplicada. No se cambió nada.';
    END IF;
END $$;

DROP INDEX ux_modelos_ia_en_produccion;
COMMENT ON COLUMN modelos_ia.estado IS 'en_produccion = lo usa la tienda (pueden ser varios: la fusión combina ResNet-50, EfficientNet-B0 y BETO).';

COMMIT;

SELECT 'Migración 007 aplicada: varios modelos pueden estar en producción.' AS resultado;
