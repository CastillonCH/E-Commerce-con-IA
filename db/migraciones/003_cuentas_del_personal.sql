-- =============================================================================
--  003_cuentas_del_personal.sql
--
--  El administrador crea y desactiva las cuentas del personal desde
--  /admin/personal (los clientes se siguen registrando solos en /login).
--
--  Qué cambia:
--    · usuarios.debe_cambiar_password: una cuenta nueva del personal (o una
--      a la que se le restableció la contraseña) recibe una contraseña
--      temporal y debe cambiarla en su primer ingreso. Así el administrador
--      nunca conoce la contraseña definitiva de nadie.
--    · usuarios.activo (ya existía) ahora sí se usa: una cuenta desactivada
--      no puede iniciar sesión. Se desactiva en vez de borrar para no perder
--      el historial de quién revisó o aprobó cada producto.
--    · Regla en la base: nunca puede quedar el sistema sin un ADMIN activo.
--
--  Para quién: bases que ya tienen aplicada la 002. Una base creada desde
--  cero con db/novastore_postgresql.sql ya viene así.
--
--  Cómo ejecutarla:
--    psql -v ON_ERROR_STOP=1 -d <tu_base> -f db/migraciones/003_cuentas_del_personal.sql
--  Todo-o-nada; si ya se aplicó, se detiene sin tocar nada.
-- =============================================================================

SET search_path = novastore, public;

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'novastore' AND table_name = 'usuarios'
                  AND column_name = 'debe_cambiar_password') THEN
        RAISE EXCEPTION 'La migración 003 ya está aplicada. No se cambió nada.';
    END IF;
END $$;

ALTER TABLE usuarios
    ADD COLUMN debe_cambiar_password boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN usuarios.debe_cambiar_password IS 'true = tiene una contraseña temporal y debe cambiarla al ingresar.';
COMMENT ON COLUMN usuarios.activo IS 'false = cuenta desactivada: no puede iniciar sesión (se conserva su historial).';

-- Nunca puede quedar el sistema sin un ADMIN activo (ni desactivándolo, ni
-- cambiándole el rol, ni borrándolo).
CREATE FUNCTION fn_usuarios_ultimo_admin()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.rol = 'ADMIN' AND OLD.activo
       AND (TG_OP = 'DELETE' OR NEW.rol <> 'ADMIN' OR NOT NEW.activo)
       AND NOT EXISTS (SELECT 1 FROM usuarios
                        WHERE rol = 'ADMIN' AND activo AND id <> OLD.id) THEN
        RAISE EXCEPTION 'Debe quedar al menos un administrador activo'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_usuarios_ultimo_admin
    BEFORE UPDATE OF rol, activo OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_usuarios_ultimo_admin();

COMMIT;

SELECT 'Migración 003 aplicada: cuentas del personal.' AS resultado;
