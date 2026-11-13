import { test, expect } from "@playwright/test";

test.describe("d. Roles del personal", () => {
  test("un ADMIN entra al dashboard y puede ver pedidos y clientes", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);

    await page.goto("/admin/pedidos");
    await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();

    await page.goto("/admin/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  });

  test("el personal de CATALOGO no puede ver pedidos, clientes ni proveedores (redirige a Productos)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("catalogo@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/);

    for (const ruta of ["/admin/pedidos", "/admin/clientes", "/admin/proveedores"]) {
      await page.goto(ruta);
      await page.waitForURL(/admin\/productos/);
    }
  });

  test("el personal de CATALOGO ve todo el catálogo de NovaStore, de todas las marcas", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("catalogo@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/);

    await expect(page.locator("aside").getByText("Panel de catálogo")).toBeVisible();
    const marcas = new Set(
      (await page.locator("table tbody tr").locator("td:nth-child(2)").allTextContents()).map((m) => m.trim()),
    );
    expect(marcas.size).toBeGreaterThan(1);
  });

  test("un cliente no puede entrar al panel de administración", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("maria.fernandez@gmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/");

    await page.goto("/admin/dashboard");
    await page.waitForURL(/admin\/login/);
  });
});
