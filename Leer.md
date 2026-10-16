# E-Commerce con IA — Frontend

Frontend de un e-commerce tipo tienda departamental con clasificación
automática de productos vía IA. Next.js habla **directo con PostgreSQL**
(`db/novastore_postgresql.sql`, esquema `novastore`) para catálogo,
usuarios y pedidos — no hay un backend FastAPI intermedio para el CRUD de
la tienda. El único servicio Python aparte de Next.js es el módulo de IA
(`ai-service/`, FastAPI + PyTorch + Hugging Face — ver su propio
`README.md` y `docs/ARQUITECTURA_IA.md`): clasifica cada producto nuevo
por imagen (CU1) y por texto (CU2), y expone los embeddings que usa la
detección de duplicados (CU5). Next.js le habla por HTTP a través de
`lib/ai-client.ts` — nunca bloquea el alta de un producto si ese servicio
está caído o no está configurado (`AI_SERVICE_URL` vacío): el producto
se guarda igual y queda en revisión manual.

Mientras no entrenes ningún modelo (ver `docs/GUIA_COLAB.md`), el
servicio de IA corre en **modo demostración** (reglas de palabras clave,
nunca presentado como un modelo real) — la UI lo marca explícitamente en
todos lados donde aparece una predicción.

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
- `lib/ai-client.ts` (fetch nativo + Zod) habla con `ai-service/`
  (microservicio FastAPI de clasificación, ver más abajo) — `lib/storage.ts`
  guarda la foto del producto (Azure Blob Storage, o `public/uploads/`
  en desarrollo local con `@azure/storage-blob` como import dinámico)
- Zustand (carrito, persistido en localStorage — pedidos y usuarios viven
  en PostgreSQL, no en el navegador)
- React Hook Form + Zod (validación de formularios y de los Server Actions)
- react-dropzone (carga de imágenes) · sonner (toasts) · lucide-react (íconos)
- OAuth 2.0 con Google implementado a mano (ver `app/api/auth/google/`)
- Vitest + Testing Library (unitarias e integración contra Postgres real)
  · Playwright + axe-core (E2E y accesibilidad) · GitHub Actions (CI)

## Cómo correr

Hay 3 piezas: PostgreSQL, este frontend (Next.js), y opcionalmente
`ai-service/` (el módulo de IA — sin él, la app funciona igual, solo que
cada producto nuevo queda en revisión sin categoría sugerida). Los
comandos de abajo están en PowerShell (Windows); si usas macOS/Linux, los
equivalentes son los mismos comandos con `bash` en vez de PowerShell
(`cp` en vez de `copy`/`Copy-Item`, `$VARIABLE` en vez de `$env:VARIABLE`,
etc. — son los comandos de siempre).

1. Levanta PostgreSQL 16+ (local, Docker, o Azure Database for PostgreSQL
   — el encabezado de `db/novastore_postgresql.sql` trae instrucciones para
   Azure) y carga el esquema **completo** en una base vacía:

   ```powershell
   psql "postgresql://usuario:password@host:5432/novastore_db" `
     -v ON_ERROR_STOP=1 -f db\novastore_postgresql.sql
   ```

   El script crea sus propias extensiones (`citext`, `pgcrypto`, `pg_trgm`,
   `unaccent`, `vector`), el esquema `novastore`, las 19 tablas, vistas y
   funciones, y siembra el catálogo de 22 productos + usuarios demo. Es
   re-ejecutable: cada corrida borra y recrea el esquema `novastore`
   (`DROP SCHEMA ... CASCADE`), así que nunca lo apuntes a una base con
   datos reales que quieras conservar.

   Si ya tenías la base de datos de **antes** de este módulo de IA,
   además corre la migración nueva (ver "Migraciones de base de datos"
   más abajo) — el script completo ya la incluye, pero una base existente
   no se actualiza sola.

2. Variables de entorno:

   ```powershell
   copy .env.example .env.local
   # Generar un secreto de sesión (con Git Bash, WSL, o cualquier
   # terminal que tenga openssl):
   openssl rand -base64 32
   ```

   En `.env.local`, como mínimo:
   - `AUTH_SECRET=...` (obligatorio, ≥32 caracteres) — la app falla
     rápido y con un mensaje claro si falta.
   - `DATABASE_URL=postgresql://usuario:password@host:5432/novastore_db`
     (obligatorio, mismo motivo).

   Para el módulo de IA (todas opcionales — sin ellas, la app sigue
   funcionando, cada producto nuevo simplemente queda en revisión sin
   categoría sugerida):
   - `AI_SERVICE_URL=http://localhost:8000` — URL de `ai-service/` (ver
     `ai-service/README.md` para levantarlo). Vacía = no se intenta
     clasificar.
   - `AI_API_KEY=...` — solo si tu `ai-service` exige autenticación
     (su propio `AI_API_KEY`, deben coincidir).
   - `REVIEW_POLICY=todos` (por defecto) o `umbral` — `"todos"` manda
     cada ficha nueva a `/admin/revision` sin importar la confianza;
     `"umbral"` publica directo si la confianza llega a
     `REVIEW_THRESHOLD` (por defecto `0.75`).
   - `AZURE_STORAGE_CONNECTION_STRING=...` — solo en producción. Sin
     ella, las fotos de producto se guardan en `public/uploads/` (fuera
     de git, solo para desarrollo local).

3. ```powershell
   npm install
   npm run dev
   ```

Abrir [http://localhost:3000](http://localhost:3000).

### El módulo de IA (opcional, pero recomendado para probar todo el flujo)

```powershell
cd ai-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Sin ningún modelo entrenado copiado a `ai-service/models/`, arranca en
**modo demostración** — ver `ai-service/README.md` para los endpoints y
`docs/GUIA_COLAB.md` para entrenar los modelos reales en Google Colab
(gratis, con GPU) y copiarlos a tu máquina.

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

```powershell
npm test              # unitarias; lib/data/*.test.ts se saltan sin DATABASE_URL
npm run test:coverage # idem, con reporte de cobertura
npm run test:e2e      # E2E (Playwright): arma la build, levanta el server y corre tests/e2e/*
```

`tests/e2e/` levanta un mock en Node del servicio de IA en modo demo
(`tests/e2e/mock-ai-service.mjs`, vía `webServer` de Playwright) — nunca
hace falta tener Python/PyTorch instalados para correr los E2E.

`ai-service/` tiene su propia suite de pytest, en Python:

```powershell
cd ai-service
.venv\Scripts\Activate.ps1
pytest
```

Corre entera en modo demo (no descarga ni entrena ningún modelo real) —
ver `ai-service/README.md`.

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
      productos/nuevo/         Alta de producto -> clasifica con IA -> AISuggestionPanel
      productos/[id]/editar/   Edición — reemplazar la foto dispara una nueva clasificación
      revision/                Cola de revisión de IA (confirmar/corregir categoría, solo ADMIN)
      duplicados/              CU5: pares detectados por embeddings (o Levenshtein de respaldo), solo ADMIN
      modelos/                 Estado del servicio de IA, métricas por modelo vs. metas del T1, solo ADMIN
      pedidos/, clientes/, vendedores/   Solo ADMIN
  api/admin/dataset-entrenamiento/  Export CSV de v_dataset_entrenamiento (solo ADMIN)
  login/                     Login/registro de clientes (Google + correo)
  api/auth/                  login, register, staff-login, google(/callback), logout
  sitemap.ts (dinámico), robots.ts
components/
  shop/                      Navbar, ProductGrid, Pagination, AssistantWidget (diálogo accesible)...
  admin/                     AdminSidebar, ProductsTable, ReviewQueue, DuplicatesList,
                             AISuggestionPanel (categoría sugerida, confianza, top-3, modo demo)...
  ui/                        Button, Input, Textarea, ConfirmDialog (reemplaza confirm() nativo)...
lib/
  db.ts                        Pool de conexión a PostgreSQL + helper query()/queryOne()
  auth.ts, session.ts          JWT de sesión (jose) — único lugar que firma/verifica
  env.server.ts, env.client.ts Validación de variables de entorno (Zod)
  ai-client.ts                 Cliente HTTP de ai-service/ (Zod, timeout 20s, nunca bloquea al vendedor)
  storage.ts                   Guarda la foto del producto (Azure Blob o public/uploads/ local)
  data/                        products-repo, orders-repo, users-repo, modelos-repo: SQL contra novastore.*
  taxonomy.ts                  Departamentos/categorías de IA (debe coincidir con la tabla categorias)
  similarity.ts                Detección de duplicados por texto (Levenshtein, respaldo de CU5)
store/cart-store.ts           Zustand (carrito, cliente)
types/                        Contratos compartidos (Product, Order, UserRole, AIResultado...)
proxy.ts                      Protección de /admin, /perfil, /checkout (reemplaza middleware.ts)
db/novastore_postgresql.sql   Esquema + datos semilla + pruebas automáticas de la base
db/migraciones/               Cambios idempotentes sobre una base ya existente (ver abajo)
tests/e2e/                    Playwright + axe-core + mock-ai-service.mjs (módulo de IA en modo demo)
tests/db-global-setup.ts      Recarga el esquema antes de correr lib/data/*.test.ts
ml/                           Dataset (Fase 1) + notebooks de Colab (Fase 2) para entrenar los modelos
ai-service/                  Módulo de IA (FastAPI + PyTorch/Hugging Face) — CU1/CU2/CU5,
                              proyecto Python aparte, ver ai-service/README.md
docs/                         ARQUITECTURA_IA.md, GUIA_COLAB.md, INFORME_IA.md, DIAGNOSTICO.md...
```

## Migraciones de base de datos

`db/novastore_postgresql.sql` es el script completo (esquema + datos
semilla desde cero) y siempre incluye el estado final correcto. Cuando
algo cambia y ya tienes una base de datos con datos que no quieres
perder, el cambio también se escribe como un script idempotente en
`db/migraciones/NNN_descripcion.sql`, para correr una sola vez contra tu
base existente:

```powershell
psql "postgresql://usuario:password@host:5432/novastore_db" `
  -f db\migraciones\001_permitir_http_en_producto_imagenes.sql
```

- **`001_permitir_http_en_producto_imagenes.sql`**: relaja
  `producto_imagenes.url_check` de exigir `https://` a aceptar también
  `http://` — necesario porque, en desarrollo local sin Azure Blob
  configurado, `lib/storage.ts` guarda la foto en
  `public/uploads/productos/` y la URL que arma Next.js para esa foto es
  `http://localhost:3000/...`, no `https://`. En producción con Azure
  Blob esto no afloja nada (Azure siempre da `https://`).

## Capa de datos

`lib/data/*-repo.ts` (productos, pedidos, usuarios, modelos) es la única
puerta de entrada a los datos — ninguna página ni componente debe hacer
SQL por su cuenta. Internamente usan `lib/db.ts` (un `Pool` de `pg`)
contra las vistas y funciones que trae `db/novastore_postgresql.sql`:

- **Lectura de catálogo** (`v_productos_tienda`): ya devuelve exactamente
  la forma del tipo `Product` del frontend.
- **Checkout** (`fn_crear_pedido`): valida stock, fija el precio desde
  `productos.precio` (nunca desde el cliente), calcula envío gratis
  (≥ S/199) y registra el pago, todo en una transacción.
- **Alta de producto con IA** (`createProductFromAI`): inserta en estado
  `pendiente_revision`; con `REVIEW_POLICY="todos"` (por defecto) siempre
  queda ahí para que un administrador confirme o corrija; con
  `REVIEW_POLICY="umbral"`, se publica directo si la confianza llega a
  `REVIEW_THRESHOLD` **y** la categoría sugerida pertenece al mismo
  departamento que eligió el vendedor. En modo real (no demo), también
  guarda una fila por modelo en `predicciones_ia` y sus embeddings en
  `producto_embeddings`, y corre la detección de duplicados (CU5) sobre
  esos embeddings. Ver `docs/ARQUITECTURA_IA.md` para el detalle completo.
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

- **Ningún modelo viene entrenado por defecto en este repositorio** —
  los pesos pesan cientos de MB/GB y no van a git. `ai-service/` corre
  igual, en modo demostración (reglas de palabras clave, nunca
  presentado como un modelo real), hasta que entrenes los 4 modelos en
  Google Colab y copies los artefactos a `ai-service/models/` — ver
  `docs/GUIA_COLAB.md` paso a paso.
- Mientras eso no pase, CU5 (duplicados) tampoco tiene embeddings reales
  que comparar — `/admin/duplicados` usa una comparación de texto por
  Levenshtein como respaldo, explícitamente marcada como tal en la UI.
- Este repositorio fue verificado en un entorno sin acceso a instalar la
  extensión `vector` de PostgreSQL por fuera de la imagen Docker
  `pgvector/pgvector:pg16` que usa el CI real — ver `docs/INFORME_IA.md`
  para el detalle exacto de qué se pudo y qué no se pudo correr en ese
  entorno de verificación (no afecta a quien instale pgvector
  normalmente, como indica el encabezado de `db/novastore_postgresql.sql`).
