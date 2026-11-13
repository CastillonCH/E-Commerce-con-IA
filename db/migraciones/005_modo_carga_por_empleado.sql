-- =============================================================================
--  005_modo_carga_por_empleado.sql
--
--  El administrador elige, por cada empleado, si carga productos CON la
--  sugerencia de la IA ('asistido') o SIN ella ('manual', para medir la
--  línea base). El cambio vale al instante, sin reiniciar el servidor, y el
--  empleado no puede cambiárselo: así la medición "sin IA vs con IA" se
--  puede contrabalancear (un empleado sin IA y otro con IA, y luego al revés).
--
--  Qué cambia:
--    · usuarios.modo_carga: NULL = usa el valor por defecto del servidor
--      (MODO_CATALOGO en .env.local, "asistido" si no está).
--
--  Para quién: bases que ya tienen aplicada la 004. Una base creada desde
--  cero con db/novastore_postgresql.sql ya viene así.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/005_modo_carga_por_empleado.sql
--  Todo-o-nada; si ya se aplicó, se detiene sin tocar nada.
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

DO $$
BEGIN
    IF to_regtype('novastore.modo_carga') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 004 (tipo modo_carga). Aplícala primero.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'novastore' AND table_name = 'usuarios'
                  AND column_name = 'modo_carga') THEN
        RAISE EXCEPTION 'La migración 005 ya está aplicada. No se cambió nada.';
    END IF;
END $$;

ALTER TABLE usuarios ADD COLUMN modo_carga modo_carga;
COMMENT ON COLUMN usuarios.modo_carga IS 'Solo personal: asistido = carga con la sugerencia de la IA; manual = sin IA (medición). NULL = valor por defecto del servidor.';

COMMIT;

SELECT 'Migración 005 aplicada: modo de carga por empleado.' AS resultado;
