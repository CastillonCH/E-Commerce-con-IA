import { test, expect } from "@playwright/test";

test.describe("e. Panel de administración: IA y pedidos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);
  });

  test("el dashboard enlaza a revisión de IA y a duplicados con sus conteos", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("link", { name: /de revisión de IA/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /duplicado/ })).toBeVisible();
  });

  test("/admin/revision carga la cola de revisión (vacía por defecto)", async ({ page }) => {
    await page.goto("/admin/revision");
    await expect(page.getByRole("heading", { name: "Revisión de IA" })).toBeVisible();
    await expect(page.getByText("No hay productos pendientes de revisión.")).toBeVisible();
  });

  test("/admin/duplicados carga el detector de duplicados (vacío por defecto)", async ({ page }) => {
    await page.goto("/admin/duplicados");
    await expect(page.getByRole("heading", { name: "Posibles duplicados" })).toBeVisible();
    await expect(page.getByText("No hay pares pendientes de revisar.")).toBeVisible();
  });

  test("/admin/modelos muestra el estado del servicio de IA (modo demo, mock)", async ({ page }) => {
    await page.goto("/admin/modelos");
    await expect(page.getByRole("heading", { name: "Modelos de IA" })).toBeVisible();
    await expect(page.getByText("El servicio de IA está en modo demostración")).toBeVisible();
  });

  test("un pedido creado por un cliente aparece en /admin/pedidos para el administrador", async ({ page, context }) => {
    // Genera un pedido en una sesión de cliente aparte, sin perder la sesión de admin.
    const clientPage = await context.browser()!.newContext().then((c) => c.newPage());
    await clientPage.goto("/login");
    await clientPage.locator("#email").fill("diego.huaman@gmail.com");
    await clientPage.locator("#password").fill("NovaStore2026!");
    await clientPage.getByRole("button", { name: "Ingresar" }).click();
    await clientPage.waitForURL("/");

    await clientPage.goto("/productos/2");
    await clientPage.getByRole("button", { name: "Añadir al carrito" }).first().click();
    await clientPage.goto("/checkout");
    await clientPage.locator("#direccion").fill("Jr. Las Flores 100");
    await clientPage.locator("#ciudad").fill("Arequipa");
    await clientPage.locator("#telefono").fill("912345678");
    await clientPage.getByRole("button", { name: "Confirmar pedido" }).click();
    await clientPage.waitForURL(/checkout\/confirmacion/);
    const orderId = (await clientPage.getByText(/^PED-/).first().textContent())!.trim();
    await clientPage.close();

    await page.goto("/admin/pedidos");
    await expect(page.getByText(orderId)).toBeVisible();
  });
});

const MOCK_AI_URL = "http://localhost:8099";

async function simularServicioIA(request: import("@playwright/test").APIRequestContext, caida: boolean) {
  await request.post(`${MOCK_AI_URL}/mock-control/caida`, { data: { caida } });
}

test.describe("e2. Alta de producto con el módulo de IA (mock en modo demo)", () => {
  test.afterEach(async ({ request }) => {
    // Nunca dejar el mock "caído" para el próximo test, corran en el orden que corran.
    await simularServicioIA(request, false);
  });

  test("vendedor da de alta con descripción y categoría -> panel de sugerencia -> admin revisa -> publicado", async ({
    page,
    request,
  }) => {
    await simularServicioIA(request, false);

    await page.goto("/admin/login");
    await page.locator("#email").fill("contacto@soundmax.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/); // un SELLER no tiene /admin/dashboard (es adminOnly)

    await page.goto("/admin/productos/nuevo");
    await page.locator("#nombre").fill("Parlante E2E con IA");
    await page
      .locator("#descripcion")
      .fill("Parlante de prueba para el flujo E2E completo de alta con IA en modo demo.");
    await page.locator("#precio").fill("149.90");
    await page.locator("#stock").fill("12");
    await page.locator("#marca").fill("SoundMax");
    await page.locator("#departamento").selectOption("Electrónica");
    await page.locator("#categoriaVendedor").selectOption("Audio y audífonos");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "parlante.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]) });

    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.getByText("Analizando imagen con Inteligencia Artificial...")).toBeHidden({
      timeout: 15_000,
    });

    // Panel de sugerencia IA (F4.4) — modo demo, categoría del mock.
    await expect(page.getByText(/Modo demostración/)).toBeVisible();
    await expect(page.getByText(/La IA sugiere: Audio y audífonos/)).toBeVisible();
    await expect(page.getByText("Coincide con la categoría que elegiste")).toBeVisible();

    // El botón lleva a /admin/revision, pero esa ruta es solo para ADMIN
    // (proxy.ts la redirige para un SELLER — defensa en profundidad, ver
    // ADMIN_ONLY_PATHS): el vendedor nunca revisa sus propias fichas, solo
    // un administrador. Entra ahora como admin para hacer la revisión real.
    await page.getByRole("button", { name: "Ir a Revisión de IA" }).click();
    await page.waitForURL(/admin\/productos$/);

    await page.goto("/api/auth/logout", { waitUntil: "networkidle" }).catch(() => {});
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);

    await page.goto("/admin/revision");
    const fila = page.getByRole("listitem").filter({ hasText: "Parlante E2E con IA" });
    await expect(fila).toHaveCount(1);
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("Parlante E2E con IA", { exact: true })).toBeHidden();

    await page.goto("/?q=Parlante+E2E+con+IA");
    await expect(page.getByText("Parlante E2E con IA")).toBeVisible();
  });

  test("servicio de IA caído: el producto se guarda igual, en revisión, sin predicción", async ({
    page,
    request,
  }) => {
    await simularServicioIA(request, true);

    await page.goto("/admin/login");
    await page.locator("#email").fill("contacto@soundmax.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/); // un SELLER no tiene /admin/dashboard (es adminOnly)

    await page.goto("/admin/productos/nuevo");
    await page.locator("#nombre").fill("Producto Sin IA Disponible E2E");
    await page
      .locator("#descripcion")
      .fill("Este producto se da de alta con el servicio de IA caído a propósito.");
    await page.locator("#precio").fill("59.90");
    await page.locator("#stock").fill("4");
    await page.locator("#marca").fill("SoundMax");
    await page.locator("#departamento").selectOption("Electrónica");
    await page.locator("#categoriaVendedor").selectOption("Audio y audífonos");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "producto.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]) });

    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.getByText("Analizando imagen con Inteligencia Artificial...")).toBeHidden({
      timeout: 15_000,
    });

    // Nunca bloquea al vendedor: igual se guarda, con un aviso, sin panel de sugerencia.
    await expect(page.getByText(/No se pudo contactar al servicio de IA/)).toBeVisible();
    await expect(page.getByText("Producto guardado — queda en revisión antes de publicarse.")).toBeVisible();

    await page.goto("/api/auth/logout").catch(() => {});
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);

    await page.goto("/admin/revision");
    const filaSinIA = page.getByRole("listitem").filter({ hasText: "Producto Sin IA Disponible E2E" });
    await expect(filaSinIA).toHaveCount(1);
    await expect(filaSinIA.getByText(/Sin categoría sugerida/)).toBeVisible();
  });
});
