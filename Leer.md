# E-Commerce con IA — Frontend

Frontend de un e-commerce tipo tienda departamental con clasificación
automática de productos vía IA. Next.js habla **directo con PostgreSQL**
(`db/novastore_postgresql.sql`, esquema `novastore`) para catálogo,
usuarios y pedidos — no hay un backend FastAPI intermedio. El único punto
que sigue hablando con un servicio externo es la clasificación de imágenes
por IA al dar de alta un producto (`NEXT_PUBLIC_API_URL`, `lib/api.ts`);
mientras ese servicio no exista, esa única acción falla con un error de red
controlado, pero no afecta al resto de la app.

Diseño inspirado en Samsung.com (blanco/negro + un único acento de color,
"Samsung Blue" #1428A0, botones tipo píldora) para la identidad visual, y
en SagaFalabella para la estructura de tienda departamental (mega menú de
categorías, franja de beneficios, catálogo masivo).

## Stack

- Next.js 16 (App Router) + TypeScript estricto
- PostgreSQL 16+ vía `pg` (`lib/db.ts`) — sin ORM, SQL directo contra las
  vistas/funciones que trae `db/novastore_postgresql.sql`
- Tailwind CSS 4
- `jose` (JWT de sesión) + `bcryptjs` (hash de contraseñas, compatible con
  los hashes bcrypt que siembra el script vía `pgcrypto`) + `server-only`
- axios (solo para la clasificación de imágenes por IA, `lib/api.ts`)
- Zustand (carrito, persistido en localStorage — pedidos y usuarios viven
  en PostgreSQL, no en el navegador)
- React Hook Form + Zod (validación de formularios y de los Server Actions)
- react-dropzone (carga de imágenes) · sonner (toasts) · lucide-react (íconos)
- OAuth 2.0 con Google implementado a mano (ver `app/api/auth/google/`)
- Vitest + Testing Library (unitarias e integración contra Postgres real)
  · Playwright + axe-core (E2E y accesibilidad) · GitHub Actions (CI)

## Cómo correr

1. Levanta PostgreSQL 16+ (local, Docker, o Azure Database for PostgreSQL
   — el encabezado de `db/novastore_postgresql.sql` trae instrucciones para
   Azure) y carga el esquema **completo** en una base vacía:

   ```bash
   psql "postgresql://usuario:password@host:5432/novastore_db" \
     -v ON_ERROR_STOP=1 -f db/novastore_postgresql.sql
   ```

   El script crea sus propias extensiones (`citext`, `pgcrypto`, `pg_trgm`,
   `unaccent`, `vector`), el esquema `novastore`, las 19 tablas, vistas y
   funciones, y siembra el catálogo de 22 productos + usuarios demo. Es
   re-ejecutable: cada corrida borra y recrea el esquema `novastore`
   (`DROP SCHEMA ... CASCADE`), así que nunca lo apuntes a una base con
   datos reales que quieras conservar.

2. Variables de entorno:

   ```bash
   cp .env.example .env.local
   # Generar un secreto de sesión:
   openssl rand -base64 32
   ```

   En `.env.local`, define `AUTH_SECRET=...` (obligatorio, ≥32 caracteres)
   y `DATABASE_URL=postgresql://usuario:password@host:5432/novastore_db`
   (obligatorio — la app falla rápido y con un mensaje claro si falta).

3. ```bash
   npm install
   npm run dev
   ```

Abrir [http://localhost:3000](http://localhost:3000).

### Cuentas de prueba

Todas las cuentas semilla usan la contraseña **`NovaStore2026!`**.

| Rol | Entra por | Ejemplo |
|---|---|---|
| Cliente | `/login` | `maria.fernandez@gmail.com` |
| Vendedor | `/admin/login` | `contacto@soundmax.pe` (ve solo sus propios productos) |
| Administrador | `/admin/login` | `admin@novastore.pe` |

El registro público (`/login`) **nunca** permite elegir rol — siempre crea
una cuenta CLIENT en PostgreSQL; el rol de staff sale siempre de la tabla
`usuarios`, nunca de lo que envíe el cliente (ver
`app/api/auth/staff-login/route.ts`).

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
npm test              # unitarias; lib/data/*.test.ts se saltan sin DATABASE_URL
npm run test:coverage # idem, con reporte de cobertura
npm run test:e2e      # E2E (Playwright): arma la build, levanta el server y corre tests/e2e/*
```

`lib/data/*.test.ts` y las rutas de autenticación que consultan la base
(`app/api/auth/{login,register,staff-login}`) son pruebas de **integración**
contra PostgreSQL real: si `DATABASE_URL` está definida,
`tests/db-global-setup.ts` recarga `db/novastore_postgresql.sql` entero
antes de correr la suite (mismo "estado limpio" en cada corrida); si no
está definida, esos archivos se saltan (no fallan) para que `npm test`
siga siendo instantáneo sin una base levantada. `npm run test:e2e` también
necesita `DATABASE_URL` apuntando a una base con el esquema ya cargado
(por defecto usa `postgresql://postgres:postgres@localhost:5432/novastore_db`
si no hay una en el entorno).

`tests/e2e/` cubre, en orden: catálogo y búsqueda, autenticación de
clientes, el flujo completo de compra (incluye verificar que el precio lo
fija la base, no el cliente), los roles de staff (vendedor acotado a sus
propios productos vía `vendedor_id`), el panel de revisión de IA/duplicados,
un escaneo de accesibilidad con axe-core, y la navegación por teclado.

En CI, `.github/workflows/ci.yml` levanta Postgres como *service container*
(`pgvector/pgvector:pg16`, que ya trae la extensión `vector`) y carga el
esquema antes de correr las pruebas.

## Arquitectura de carpetas

```
app/
  (shop)/                   Vistas del comprador (Navbar+Footer+Asistente en su layout)
    page.tsx                  Home: Hero + carruseles + grilla paginada
    productos/[id]/            Detalle (generateMetadata + JSON-LD)
    checkout/                  Carrito -> pedido (actions.ts: Server Action -> fn_crear_pedido)
    perfil/pedidos/             Historial del cliente
  admin/
    login/                   Login de staff — página pública
    (protected)/             Route group: AdminSidebar, protegido por proxy.ts
      dashboard/               Métricas reales (v_dashboard_kpis) + atajos a revisión/duplicados
      productos/               ADMIN ve todo, SELLER solo sus propios productos (vendedor_id)
      productos/nuevo/         Alta de producto -> actions.ts decide si publica o manda a revisión
      revision/                Cola de clasificaciones de IA con baja confianza (solo ADMIN)
      duplicados/              Detección de productos casi duplicados (solo ADMIN)
      pedidos/, clientes/, vendedores/   Solo ADMIN
  login/                     Login/registro de clientes (Google + correo)
  api/auth/                  login, register, staff-login, google(/callback), logout
  sitemap.ts (dinámico), robots.ts
components/
  shop/                      Navbar, ProductGrid, Pagination, AssistantWidget (diálogo accesible)...
  admin/                     AdminSidebar, ProductsTable, ReviewQueue, DuplicatesList...
  ui/                        Button, Input, ConfirmDialog (reemplaza confirm() nativo)...
lib/
  db.ts                        Pool de conexión a PostgreSQL + helper query()/queryOne()
  auth.ts, session.ts          JWT de sesión (jose) — único lugar que firma/verifica
  env.server.ts, env.client.ts Validación de variables de entorno (Zod)
  data/                        products-repo, orders-repo, users-repo: SQL contra novastore.*
  taxonomy.ts                  Departamentos/categorías de IA (debe coincidir con la tabla categorias)
  similarity.ts                Detección de duplicados por texto (Levenshtein normalizado)
store/cart-store.ts           Zustand (carrito, cliente)
types/                        Contratos compartidos (Product, Order, UserRole...)
proxy.ts                      Protección de /admin, /perfil, /checkout (reemplaza middleware.ts)
db/novastore_postgresql.sql   Esquema + datos semilla + pruebas automáticas de la base
tests/e2e/                    Playwright + axe-core
tests/db-global-setup.ts      Recarga el esquema antes de correr lib/data/*.test.ts
```

## Capa de datos

`lib/data/*-repo.ts` (productos, pedidos, usuarios) es la única puerta de
entrada a los datos — ninguna página ni componente debe hacer SQL por su
cuenta. Internamente usan `lib/db.ts` (un `Pool` de `pg`) contra las vistas
y funciones que trae `db/novastore_postgresql.sql`:

- **Lectura de catálogo** (`v_productos_tienda`): ya devuelve exactamente
  la forma del tipo `Product` del frontend.
- **Checkout** (`fn_crear_pedido`): valida stock, fija el precio desde
  `productos.precio` (nunca desde el cliente), calcula envío gratis
  (≥ S/199) y registra el pago, todo en una transacción.
- **Alta de producto con IA** (`createProductFromAI`): inserta en estado
  `pendiente_revision`; si la confianza del modelo es ≥75% lo publica de
  inmediato, si no, queda en la cola de `/admin/revision`.
- **Identidad de vendedor**: un `SELLER` se resuelve por `vendedor_id`
  (de su sesión → `usuarios.email` → `vendedores.usuario_id`), nunca
  comparando texto de marca — el nombre comercial de una tienda
  (`vendedores.nombre_comercial`, p. ej. "SoundMax Perú") no tiene por qué
  coincidir con el texto de `marca` en sus productos (p. ej. "SoundMax").

## Seguridad

- Sesión: JWT firmado (HS256, `jose`), cookie `httpOnly`/`sameSite=lax`,
  expira a las 8h. `AUTH_SECRET` es obligatorio (≥32 caracteres) — la app
  falla rápido si falta, no usa un valor por defecto inseguro.
- `proxy.ts` es una comprobación **optimista**: cada Server
  Component/Action que lee o muta datos vuelve a comprobar la sesión y el
  rol por su cuenta (ver el comentario en `proxy.ts`).
- Ningún endpoint confía en un `role` enviado por el cliente: siempre sale
  de la tabla `usuarios`.
- Un `SELLER` no puede editar/eliminar el producto de otro vendedor
  (`isProductOwnedByVendedor`) ni publicar a nombre de una marca que ya
  tiene productos de otro vendedor (`isMarcaOwnedByOtherVendedor`).
- El precio y el stock de un pedido siempre salen de `productos` en la
  base, nunca de lo que mande el cliente en el checkout.
- `safeRedirect()` neutraliza open redirects en todos los `?from=`.
- CSP + cabeceras de seguridad en `next.config.ts`.

## Límites conocidos

- La clasificación de imágenes por IA (`NEXT_PUBLIC_API_URL`) es un
  servicio externo que todavía no existe en este repo; dar de alta un
  producto nuevo falla con un error de red hasta que se despliegue.
- Editar un producto no permite reemplazar su foto (eso dispararía una
  nueva clasificación de IA, que depende del mismo servicio pendiente).
- `/admin/vendedores` (aprobar/rechazar solicitudes) sigue siendo una
  vista de ejemplo sin conectar a la tabla `vendedores`.
