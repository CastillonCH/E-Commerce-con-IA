# Informe final — Refactor de producción

Rama: `refactor/frontend-produccion` · Base: `claude/ecommerce-ml-frontend-arch-ni5fvl`

Ver `docs/DIAGNOSTICO.md` para el detalle de hallazgos que motivó cada fase.
Este informe resume qué se hizo, por qué, y qué queda pendiente.

## Resumen por fase

| Fase | Commit | Qué cambió |
|---|---|---|
| 0 — Diagnóstico | `75c74d3` | Relevamiento de hallazgos (tabla completa en `DIAGNOSTICO.md`) |
| 1 — Seguridad y sesión | `715715f` | Sesión JWT firmada (`jose`), rol siempre desde `usersRepo`, quitar selector de rol del login de staff, `proxy.ts` cubre `/admin` + `/perfil` + `/checkout`, `safeRedirect()` contra open redirect, CSP y cabeceras en `next.config.ts`, Google OAuth valida `email_verified` |
| 2 — Capa de datos | `9ef267f` | `lib/data/*-repo.ts` como única puerta de entrada a datos (en ese momento, en memoria); páginas/componentes dejan de importar `MOCK_PRODUCTS` directo; pedidos y carrito salen de `localStorage`; tipos (`types/index.ts`) alineados al contrato real de IA |
| 3 — Flujo de IA | `fddda1a` | Cola de revisión (`/admin/revision`) para confianza < 75%, detección de duplicados (`/admin/duplicados`, Levenshtein normalizado), `ConfirmDialog` reemplaza `confirm()` nativo |
| 4 — Rendimiento y SEO | `938f942` | Reducir `"use client"` a lo mínimo, `generateMetadata` + JSON-LD en producto, `sitemap.xml`/`robots.txt`, paginación real, `?categoria=` filtra categoría de verdad (no departamento) |
| 5 — Accesibilidad | `e46a924` | Mega-menú operable por teclado, `AssistantWidget` como diálogo accesible (`role="dialog"`, focus trap), `fieldset`/`legend` en método de pago, contraste AA, landmarks `<main>` |
| 6 — Config, pruebas y CI | `f90260a` | `lib/env.server.ts`/`env.client.ts` (Zod), Vitest + Testing Library, Playwright + axe-core, GitHub Actions |
| 7 — Conexión a PostgreSQL | `afa6c0d` | Reemplaza los repos en memoria de la Fase 2 por SQL real contra el esquema `novastore_postgresql.sql` del usuario — ver detalle abajo |

## Fase 7 en detalle: de mocks a PostgreSQL real

No estaba en el alcance original (fases 0-6 asumían que la base llegaría
después), pero el usuario proveyó su propio esquema PostgreSQL ya probado
en su máquina y pidió conectar el frontend. Decisión tomada y confirmada
con el usuario: Next.js habla **directo con PostgreSQL** vía `pg`
(`lib/db.ts`), sin backend FastAPI intermedio — no existe ningún repo de
backend accesible, y el único punto que de verdad necesita un servicio
externo es la clasificación de imágenes por IA.

Cambios principales:

- `lib/data/{products,orders,users}-repo.ts` reescritos para consultar
  las vistas/funciones del esquema (`v_productos_tienda`, `fn_crear_pedido`,
  `v_admin_clientes`, etc.) en vez de arrays en memoria.
- **Checkout seguro**: el precio y el stock salen siempre de `productos`
  en la base (`fn_crear_pedido`), nunca de lo que mande el cliente — antes
  el mock aceptaba el precio en el payload del Server Action.
- **Bug real encontrado y corregido**: la identidad de un vendedor se
  resolvía comparando el texto de `marca` contra `vendedores.nombre_comercial`,
  que no siempre coinciden (p. ej. "SoundMax" vs "SoundMax Perú"). Se
  corrigió resolviendo siempre por `vendedor_id` desde la sesión
  (`getVendedorIdByEmail`), con pruebas de integración que reprodujeron
  el fallo antes del fix.
- Baja de producto pasa a ser soft-delete (`estado = 'inactivo'`), porque
  el esquema prohíbe el `DELETE` físico si el producto ya tiene pedidos.
- `db/novastore_postgresql.sql` (el script del usuario, sin modificar) se
  versiona en el repo; `tests/db-global-setup.ts` lo recarga antes de las
  pruebas de integración; CI levanta Postgres como *service container*.
- `app/sitemap.ts` se marcó `force-dynamic` porque Next intentaba
  prerenderizarlo en build time, lo que exigía `DATABASE_URL` incluso para
  compilar.

## Verificación

- 88 pruebas unitarias/integración (Vitest) + 26 E2E (Playwright + axe-core)
  corridas contra una instancia real de PostgreSQL 16, cargada con el
  esquema exacto del usuario — no simulado.
- Recorrido manual: registro/login de cliente, checkout con precio fijado
  por la base, visibilidad de pedidos para admin, cambio de estado de
  pedido, acotamiento de productos por vendedor (caso SoundMax
  re-verificado), edición y baja de producto, fallo controlado al dar de
  alta un producto sin el servicio de IA externo.
- `npm run lint`, `npx tsc --noEmit` y `npm run build` limpios, con y sin
  `DATABASE_URL` definida (para no romper builds sin base disponible).

## Fase 8: `/admin/vendedores` conectado a la base

Era el único punto pendiente que no dependía del servicio externo de IA.
`lib/data/users-repo.ts` suma `listPendingVendedores`/`listActiveVendedores`
(sobre `v_admin_vendedores`) y `approveVendedorApplication`/
`rejectVendedorApplication` (`UPDATE vendedores ... RETURNING`, el trigger
`fn_vendedor_sync_rol` de la base se encarga de pasar el rol del usuario a
`SELLER` o de vuelta a `CLIENT`). Verificado end-to-end contra Postgres
real: aprobar/rechazar una solicitud semilla, confirmando en la base que
el rol, `motivo_rechazo` y `revisado_por` quedaron correctos, y que la UI
refleja el cambio sin recargar manualmente.

## Pendientes conocidos (no resueltos en este refactor)

1. **Clasificación de imágenes por IA** (`NEXT_PUBLIC_API_URL`): servicio
   externo que no existe en ningún repo accesible. Dar de alta un
   producto nuevo falla con un error de red controlado hasta que se
   despliegue. No se puede resolver desde el frontend sin ese servicio.
2. **Editar producto no permite reemplazar la foto** — consecuencia
   directa de (1): cambiar la imagen dispararía una nueva clasificación.
