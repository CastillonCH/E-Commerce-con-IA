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
    await expect(page.getByText("No se detectaron posibles duplicados.")).toBeVisible();
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
