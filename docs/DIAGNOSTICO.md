# Fase 0 — Diagnóstico

## Nota sobre esta segunda corrida

Este refactor ya se hizo una vez completo (fases 0-6) en una rama
`refactor/frontend-produccion` que nunca se subió a `origin` (por
instrucción explícita de no pushear hasta que se pidiera). El contenedor
donde vivía esa rama se reciclió entre sesiones y el trabajo se perdió por
completo — no queda rastro en `git log --all`, el reflog ni en el remoto.
Esta es una segunda pasada, idéntica en alcance, **pusheando cada fase a
origin** para no repetir la pérdida.

## Discrepancias encontradas (vs. las premisas del prompt original)

| # | Premisa | Realidad |
|---|---|---|
| D1 | Se asume una rama `main` | No existe `main`; se trabaja sobre `claude/ecommerce-ml-frontend-arch-ni5fvl`, la única rama real en `origin` |
| D2 | El build con `next/font/google` (Geist) fallaría por falta de red | No falla en este sandbox — se migra a `next/font/local` igual en la Fase 4, por instrucción explícita, no por necesidad |
| D3 | — | `lint`/`tsc`/`build` de partida ya pasan limpios (24 rutas) |
| D4 | — | `CLAUDE.md`/`AGENTS.md`/`README.md` aparecen renombrados a `note.md`/`Agentes.md`/`Leer.md` en el historial de la rama base (commits ajenos a este refactor); no se tocan, no son parte del alcance pedido |

## Tabla de hallazgos (archivo · problema · severidad · fase)

| Archivo | Problema | Severidad | Fase |
|---|---|---|---|
| `lib/auth.ts` | Cookie `session` es JSON en base64 **sin firmar** — cualquiera puede fabricar una con `role:"ADMIN"` a mano | Crítica | 1 |
| `app/api/auth/staff-login/route.ts` | El rol puede venir del body de la request en vez de leerse siempre de `usersRepo` | Crítica | 1 |
| `app/admin/login/page.tsx` | Selector de rol visible en el login de staff — el cliente elige su propio rol | Alta | 1 |
| `app/login/page.tsx` / `register` | Login/registro no validan contra un `usersRepo` real (cualquier password "funciona") | Alta | 1 |
| — | Open redirect en los parámetros `?from=` de login | Alta | 1 |
| `app/api/auth/google/callback/route.ts` | No verifica `email_verified`; no queda claro de dónde sale el rol | Alta | 1 |
| `proxy.ts` | Solo protege `/admin`, no `/perfil` ni `/checkout` | Alta | 1 |
| `next.config.ts` | Sin CSP ni cabeceras de seguridad | Media | 1 |
| `components/shop/ProductGrid.tsx`, `DepartmentMegaMenu.tsx`, etc. | Importan `MOCK_PRODUCTS` directamente — imposible de sustituir por un backend real sin reescribir componentes | Alta | 2 |
| `app/admin/(protected)/dashboard/page.tsx` | Métricas con números fijos en el código | Alta | 2/3 |
| `store/orders-store.ts` | Pedidos en `localStorage` — el admin solo ve los pedidos hechos desde su propio navegador | Crítica | 2 |
| — | Envío gratis nunca se cobra realmente (no hay regla de negocio aplicada) | Media | 2 |
| `store/cart-store.ts` | `addItem` se llama en bucle para sumar cantidad; guarda el producto completo, no un snapshot mínimo | Media | 2 |
| `types/index.ts` | No coincide con el contrato real (`AIResponse.accuracy` en vez de `confidence`, falta `Seller`/`Review`/`DuplicatePair`/etc.) | Alta | 2 |
| — | No existe flujo de revisión de IA, ni detección de duplicados, ni panel de sugerencia | Alta | 3 |
| `components/admin/ProductsTable.tsx` | Usa `confirm()` nativo | Baja | 3/5 |
| Toda la app | Overuse de `"use client"` (`ProductCard`, `ProductCarousel` completos) | Media | 4 |
| `app/(shop)/productos/[id]/page.tsx` | Sin `generateMetadata`, JSON-LD, `sitemap.xml`, `robots.txt` | Media | 4 |
| — | `?categoria=` en realidad filtra por departamento; no hay paginación real | Media | 4 |
| `components/shop/Navbar.tsx` | Mega-menú no operable por teclado | Alta | 5 |
| `components/shop/CheckoutForm.tsx` o equivalente | Sin validación accesible, sin `fieldset`/`legend` en método de pago | Media | 5 |
| `components/shop/AssistantWidget.tsx` | No es un diálogo accesible (sin `role="dialog"`, sin focus trap) | Media | 5 |
| — | Cero tests, sin CI, sin `lib/env.ts` | Alta | 6 |

## Veredicto

Se procede con las 6 fases en el mismo orden y alcance ya acordado,
branchando desde el HEAD actual de `claude/ecommerce-ml-frontend-arch-ni5fvl`
hacia `refactor/frontend-produccion`, con push a `origin` después de cada
commit de fase.
