# E-Commerce con IA — Frontend

Frontend de un e-commerce tipo tienda departamental con clasificación
automática de productos vía IA. Este repo cubre **solo el frontend**; el
motor de IA y el backend en FastAPI se desarrollan por separado y se
conectan mediante `NEXT_PUBLIC_API_URL`. Mientras ese backend no esté
conectado, el catálogo, los pedidos y los usuarios viven en memoria del
servidor de Next.js (ver [Capa de datos](#capa-de-datos-y-límites-actuales)).

Diseño inspirado en Samsung.com (blanco/negro + un único acento de color,
"Samsung Blue" #1428A0, botones tipo píldora) para la identidad visual, y
en SagaFalabella para la estructura de tienda departamental (mega menú de
categorías, franja de beneficios, catálogo masivo).

## Stack

- Next.js 16 (App Router) + TypeScript estricto
- Tailwind CSS 4
- `jose` (JWT de sesión) + `bcryptjs` (hash de contraseñas) + `server-only`
- axios (cliente hacia el backend de IA, `lib/api.ts`)
- Zustand (carrito, persistido en localStorage — los pedidos y usuarios
  viven en el servidor, no en el navegador)
- React Hook Form + Zod (validación de formularios y de los Server Actions)
- react-dropzone (carga de imágenes) · sonner (toasts) · lucide-react (íconos)
- OAuth 2.0 con Google implementado a mano (ver `app/api/auth/google/`)
- Vitest + Testing Library (unitarias) · Playwright + axe-core (E2E y
  accesibilidad) · GitHub Actions (CI)

## Cómo correr

```bash
cp .env.example .env.local
# Generar un secreto de sesión:
openssl rand -base64 32
# Pegarlo en .env.local como AUTH_SECRET=... (obligatorio, mínimo 32 caracteres)

npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### Cuentas de prueba

Todas las cuentas semilla usan la contraseña **`NovaStore2026!`**.

| Rol | Entra por | Ejemplo |
|---|---|---|
| Cliente | `/login` | `maria.fernandez@gmail.com` |
| Vendedor | `/admin/login` | `contacto@soundmax.pe` (ve solo productos "SoundMax") |
| Administrador | `/admin/login` | `admin@novastore.pe` |

El registro público (`/login`) **nunca** permite elegir rol — siempre crea
una cuenta CLIENT; el rol de staff sale siempre de `lib/data/users-repo.ts`,
nunca de lo que envíe el cliente (ver `app/api/auth/staff-login/route.ts`).

### Login con Google (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   crear un "OAuth Client ID" tipo *Web application*.
2. Agregar `http://localhost:3000/api/auth/google/callback` como
   *Authorized redirect URI*.
3. Copiar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` a `.env.local`.

Sin esas variables, el botón "Continuar con Google" redirige de vuelta al
login con un mensaje de error controlado.

## Pruebas

```bash
npm test              # unitarias (Vitest)
npm run test:coverage # idem, con reporte de cobertura
npm run test:e2e      # E2E (Playwright): arma la build, levanta el server y corre tests/e2e/*
```

`tests/e2e/` cubre, en orden: catálogo y búsqueda, autenticación de
clientes, el flujo completo de compra, los roles de staff (incluido el
catálogo acotado por marca de cada vendedor), el panel de revisión de
IA/duplicados, un escaneo de accesibilidad con axe-core en las páginas
principales, y la navegación por teclado (skip link, mega-menú, menú de
cuenta, asistente). `npm run test:e2e` descarga/usa Chromium vía
Playwright; en CI, `.github/workflows/ci.yml` corre `npx playwright
install --with-deps chromium` antes.

## Arquitectura de carpetas

```
app/
  (shop)/                   Vistas del comprador (Navbar+Footer+Asistente en su layout)
    page.tsx                  Home: Hero + carruseles + grilla paginada
    productos/[id]/            Detalle (generateMetadata + JSON-LD)
    checkout/                  Carrito -> pedido (actions.ts: Server Action)
    perfil/pedidos/             Historial del cliente
  admin/
    login/                   Login de staff — página pública
    (protected)/             Route group: AdminSidebar, protegido por proxy.ts
      dashboard/               Métricas reales + atajos a revisión/duplicados
      productos/               ADMIN ve todo, SELLER solo su marca
      productos/nuevo/         Alta de producto -> actions.ts decide si publica o manda a revisión
      revision/                Cola de clasificaciones de IA con baja confianza (solo ADMIN)
      duplicados/              Detección de productos casi duplicados (solo ADMIN)
      pedidos/, clientes/, vendedores/   Solo ADMIN
  login/                     Login/registro de clientes (Google + correo)
  api/auth/                  login, register, staff-login, google(/callback), logout
  sitemap.ts, robots.ts
components/
  shop/                      Navbar, ProductGrid, Pagination, AssistantWidget (diálogo accesible)...
  admin/                     AdminSidebar, ProductsTable, ReviewQueue, DuplicatesList...
  ui/                        Button, Input, ConfirmDialog (reemplaza confirm() nativo)...
lib/
  auth.ts, session.ts         JWT de sesión (jose) — único lugar que firma/verifica
  env.server.ts, env.client.ts  Validación de variables de entorno (Zod)
  data/                        products-repo, orders-repo, users-repo (ver más abajo)
  taxonomy.ts                  Departamentos/categorías de IA (antes vivía en types/)
  similarity.ts                Detección de duplicados (Levenshtein normalizado)
store/cart-store.ts           Zustand (carrito, cliente)
types/                        Contratos compartidos (Product, Order, UserRole...)
proxy.ts                      Protección de /admin, /perfil, /checkout (reemplaza middleware.ts)
tests/e2e/                    Playwright + axe-core
```

## Capa de datos y límites actuales

`lib/data/*-repo.ts` (productos, pedidos, usuarios) son la única puerta de
entrada a los datos — ninguna página ni componente debe importar datos
directamente. Hoy son almacenes **en memoria del proceso de Next.js**
(se reinician con cada despliegue/reinicio del server); son el punto exacto
donde conectar el backend real en FastAPI/PostgreSQL sin tocar a quien los
llama. Las mutaciones de productos (alta/edición/borrado) ya llaman al
backend de IA a través de `lib/api.ts`; mientras ese backend no esté
desplegado, esas acciones fallan con un error de red controlado.

## Flujo de IA

Al dar de alta un producto (`/admin/productos/nuevo`), un Server Action
(`app/admin/(protected)/productos/actions.ts`) llama al backend de
clasificación. Si la confianza devuelta es menor al 75%, el producto **no
se publica** de inmediato: entra a la cola de `/admin/revision`, donde un
administrador confirma o corrige la categoría antes de que aparezca en la
tienda. `/admin/duplicados` compara, dentro de cada marca, los nombres de
los productos ya publicados para detectar altas duplicadas.

## Seguridad

- Sesión: JWT firmado (HS256, `jose`), cookie `httpOnly`/`sameSite=lax`,
  expira a las 8h. `AUTH_SECRET` es obligatorio (≥32 caracteres) — la app
  falla rápido si falta, no usa un valor por defecto inseguro.
- `proxy.ts` es una comprobación **optimista**: cada Server
  Component/Action que lee o muta datos vuelve a comprobar la sesión y el
  rol por su cuenta (ver el comentario en `proxy.ts`).
- Ningún endpoint confía en un `role` enviado por el cliente: siempre sale
  del registro de `lib/data/users-repo.ts`.
- `safeRedirect()` neutraliza open redirects en todos los `?from=`.
- CSP + cabeceras de seguridad en `next.config.ts`.

## Próximo paso: conectar la base de datos real

El frontend está listo para conectarse a un backend real (PostgreSQL vía
FastAPI). Cuando eso ocurra:

1. Reemplazar el almacenamiento en memoria de `lib/data/*-repo.ts` por
   llamadas HTTP al backend, sin cambiar las firmas que ya usan las
   páginas/Server Actions.
2. Eliminar los datos semilla de desarrollo (`SEED_STAFF`, `SEED_CLIENTS`,
   el catálogo hardcodeado en `products-repo.ts`).
3. Ajustar `NEXT_PUBLIC_API_URL` y, si el backend emite sus propios JWT,
   adaptar `lib/session.ts` para verificarlos (ya aislado en un único
   módulo para que ese cambio no toque a sus llamadores).
