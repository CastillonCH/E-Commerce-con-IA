-- 001_permitir_http_en_producto_imagenes.sql
--
-- Por qué: lib/storage.ts (Fase 4 del módulo de IA) sube las fotos de
-- producto a Azure Blob Storage cuando hay AZURE_STORAGE_CONNECTION_STRING
-- configurada, y si no, cae a guardarlas en public/uploads/ servidas por
-- el propio Next.js — tal como pide la especificación ("Desarrollo:
-- public/uploads/productos/<uuid>.<ext>"). En ese segundo caso, en
-- desarrollo local, la URL que arma la app es http://localhost:3000/...,
-- no https://. La restricción original de producto_imagenes.url solo
-- aceptaba "https://", así que CUALQUIER alta de producto en un entorno
-- de desarrollo sin Azure configurado fallaba con una violación de CHECK
-- (se encontró corriendo el E2E de alta de producto de la Fase 4 contra
-- Postgres real, no es hipotético).
--
-- Azure Blob Storage siempre da URLs https://, así que en producción esto
-- no afloja nada — solo deja pasar también http://, que antes no existía.
--
-- Idempotente: se puede correr más de una vez sin error.

SET search_path = novastore, public;

ALTER TABLE producto_imagenes DROP CONSTRAINT IF EXISTS producto_imagenes_url_check;
ALTER TABLE producto_imagenes ADD CONSTRAINT producto_imagenes_url_check CHECK (url ~ '^https?://');
