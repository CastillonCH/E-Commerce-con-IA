import { test, expect } from "@playwright/test";

test.describe("d. Roles de staff", () => {
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

  test("un SELLER no puede ver /admin/pedidos ni /admin/clientes (redirige a su catálogo)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("contacto@soundmax.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/);

    await page.goto("/admin/pedidos");
    await page.waitForURL(/admin\/productos/);
  });

  test("un SELLER solo ve productos de su propia marca en /admin/productos", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("contacto@soundmax.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/productos/);

    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    const marcas = await rows.locator("td").nth(1).allTextContents();
    for (const marca of marcas) {
      expect(marca.trim()).toBe("SoundMax");
    }
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
