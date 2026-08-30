# E-Commerce con IA — Frontend

Frontend de un e-commerce tipo tienda departamental con clasificación
automática de productos vía Transfer Learning. Este repo cubre **solo el
frontend**; el motor de IA y el backend en FastAPI se desarrollan por
separado y se conectan mediante la variable `NEXT_PUBLIC_API_URL`.

## Stack

- Next.js 16 (App Router) + TypeScript estricto
- Tailwind CSS 4
- axios (cliente centralizado en `lib/api.ts`)
- Zustand (estado del carrito, persistido en localStorage)
- React Hook Form + Zod (validación de formularios y de las respuestas del backend)
- react-dropzone (carga de imágenes)
- sonner (toasts) · lucide-react (íconos)

## Arquitectura de carpetas

```
app/
  (shop)/            Vistas del comprador (Navbar propio en su layout)
    page.tsx          Home: Hero + grilla de productos
    carrito/
    perfil/
  admin/              Panel protegido por proxy.ts (requiere rol ADMIN)
    layout.tsx         Sidebar + área principal
    dashboard/
    productos/
      nuevo/            Alta de producto -> dispara la clasificación IA
  login/               Login temporal de desarrollo (ver TODOs)
  api/auth/            Rutas stub de login/logout (a reemplazar por FastAPI)
components/
  shop/                Navbar, HeroSection, ProductGrid, ProductCard
  admin/               AdminSidebar, ImageDropzone
  ui/                  Primitivos (Button, Input, Select...)
lib/                   api.ts, auth.ts, config.ts, utils.ts, mock-products.ts
store/                 cart-store.ts (Zustand)
types/                 Contratos compartidos con el backend (User, Product, AIResponse...)
proxy.ts               Protección de /admin (reemplaza a middleware.ts en Next 16)
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

Para entrar a `/admin`, primero inicia sesión en `/login` (acepta cualquier
email mientras no exista `POST /api/auth/login` en el backend).

## Conectar con el backend (FastAPI)

Todo el contrato de datos vive en `types/index.ts` y todas las llamadas HTTP
pasan por `lib/api.ts`. Al levantar el backend:

1. Ajustar `NEXT_PUBLIC_API_URL` en `.env.local` (por defecto `http://localhost:8000`).
2. En `components/shop/ProductGrid.tsx`, cambiar `MOCK_PRODUCTS` por
   `await fetchProducts()`.
3. En `app/api/auth/login/route.ts` y `proxy.ts`, reemplazar el stub de
   sesión por verificación real del JWT que emita FastAPI (los TODOs están
   marcados en el código).
4. En `next.config.ts`, añadir el hostname real del bucket S3 a
   `images.remotePatterns`.

`app/admin/productos/nuevo/page.tsx` ya envía el formulario como
`multipart/form-data` a `POST /api/productos` y muestra el estado de carga
("Analizando imagen con Inteligencia Artificial...") mientras el backend
clasifica la imagen; al responder, muestra un toast con la categoría que
predijo el modelo.
