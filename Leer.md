# E-Commerce con IA — Frontend

Frontend de un e-commerce tipo tienda departamental con clasificación
automática de productos vía Transfer Learning. Este repo cubre **solo el
frontend**; el motor de IA y el backend en FastAPI se desarrollan por
separado y se conectan mediante la variable `NEXT_PUBLIC_API_URL`.

Diseño inspirado en Samsung.com (blanco/negro + un único acento de color,
"Samsung Blue" #1428A0, botones tipo píldora) para la identidad visual, y
en SagaFalabella para la estructura de tienda departamental (mega menú de
categorías, franja de beneficios, catálogo masivo).

## Stack

- Next.js 16 (App Router) + TypeScript estricto
- Tailwind CSS 4
- axios (cliente centralizado en `lib/api.ts`)
- Zustand (estado del carrito, persistido en localStorage)
- React Hook Form + Zod (validación de formularios y de las respuestas del backend)
- react-dropzone (carga de imágenes)
- sonner (toasts) · lucide-react (íconos)
- OAuth 2.0 con Google implementado a mano (sin librería, ver `app/api/auth/google/`)

## Roles

| Rol | Cómo entra | Qué ve |
|---|---|---|
| **Cliente** | `/login` (Google o correo, con registro público) | Tienda, carrito, `/perfil` |
| **Vendedor** | `/admin/login` (sin registro público) | `/admin/productos*` — alta y gestión de sus productos |
| **Administrador** | `/admin/login` (sin registro público) | Todo lo del vendedor + `/admin/dashboard` (métricas) + `/admin/vendedores` (aprobar/rechazar) |

El registro público (`/login`) **nunca** permite elegir rol — siempre crea
una cuenta CLIENT. El staff (Vendedor/Administrador) usa una puerta
separada (`/admin/login`) que no está enlazada desde la tienda pública.

## Arquitectura de carpetas

```
app/
  (shop)/                 Vistas del comprador (Navbar+Footer+Asistente en su layout)
    page.tsx               Home: Hero + grilla de productos
    carrito/ · perfil/ · ayuda/
  admin/
    login/                 Login de staff (Vendedor/Administrador) — página pública
    (protected)/           Route group: layout con AdminSidebar, protegido por proxy.ts
      dashboard/            Solo ADMIN — métricas
      vendedores/           Solo ADMIN — aprobar/rechazar vendedores
      productos/            ADMIN o SELLER — catálogo
      productos/nuevo/      ADMIN o SELLER — alta de producto, dispara la clasificación IA
  login/                   Login/registro de clientes (Google + correo)
  api/auth/
    login/, register/       Clientes (stub, siempre rol CLIENT)
    staff-login/             Staff (stub — ver TODO sobre por qué el rol no debe venir del cliente)
    google/, google/callback/  Flujo OAuth 2.0 con Google, a mano
    logout/
components/
  shop/                    Navbar, HeroSection, ProductGrid, ProductCard, Footer,
                           AssistantWidget (asistente por opciones), GoogleIcon, SocialIcons
  admin/                   AdminSidebar (nav según rol), ImageDropzone
  ui/                      Primitivos (Button, Input, Select...)
lib/                       api.ts, auth.ts (sesión), config.ts, utils.ts, mock-products.ts
store/                     cart-store.ts (Zustand)
types/                     Contratos compartidos con el backend (User, Product, AIResponse...)
proxy.ts                   Protección de /admin por rol (reemplaza a middleware.ts en Next 16)
```

## Cómo correr

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). El catálogo usa datos
simulados (`lib/mock-products.ts`) hasta que el backend exponga
`GET /api/productos`.

- Cliente: `/login`, cualquier correo/contraseña sirve (o "Crear cuenta").
- Staff: `/admin/login`, elige "Vendedor" o "Administrador" en el selector
  (ver el TODO en `app/api/auth/staff-login/route.ts` sobre por qué eso es
  solo un atajo de desarrollo).

### Login con Google

El botón "Continuar con Google" ya implementa el flujo OAuth 2.0 completo.
Para activarlo:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   crear un "OAuth Client ID" tipo *Web application*.
2. Agregar `http://localhost:3000/api/auth/google/callback` (y el
   equivalente de producción) como *Authorized redirect URI*.
3. Copiar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` a `.env.local`.

Sin esas variables, el botón redirige de vuelta al login con un mensaje de
error controlado — no rompe la página.

## Conectar con el backend (FastAPI)

Todo el contrato de datos vive en `types/index.ts` y todas las llamadas HTTP
pasan por `lib/api.ts`. Al levantar el backend:

1. Ajustar `NEXT_PUBLIC_API_URL` en `.env.local` (por defecto `http://localhost:8000`).
2. En `components/shop/ProductGrid.tsx`, cambiar `MOCK_PRODUCTS` por
   `await fetchProducts()`.
3. En `app/api/auth/*` y `lib/auth.ts`, reemplazar la cookie de sesión sin
   firmar por verificación real del JWT que emita FastAPI (los TODOs están
   marcados en cada archivo). El rol de un usuario de staff debe salir
   siempre del registro del backend, nunca de un campo enviado por el cliente.
4. En `next.config.ts`, añadir el hostname real del bucket S3 a
   `images.remotePatterns`.

`app/admin/(protected)/productos/nuevo/page.tsx` ya envía el formulario como
`multipart/form-data` a `POST /api/productos` y muestra el estado de carga
("Analizando imagen con Inteligencia Artificial...") mientras el backend
clasifica la imagen; al responder, muestra un toast con la categoría que
predijo el modelo.

## Asistente virtual

`components/shop/AssistantWidget.tsx` es un asistente por opciones (sin
campo de texto libre): el usuario elige un tema y, según el tema, ve una
respuesta dentro de la tienda o pasa a WhatsApp con un asesor humano
(`NEXT_PUBLIC_WHATSAPP_NUMBER`). Conectarlo a un motor de IA con respuestas
generadas (no solo opciones fijas) es trabajo de backend — el punto exacto
para eso está marcado con un TODO en el componente.
