import { test, expect } from "@playwright/test";

test.describe("b. Autenticación de clientes", () => {
  test("un cliente puede registrarse, queda con sesión iniciada y puede cerrar sesión", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;

    await page.goto("/login?tab=register");
    await page.getByLabel("Nombre").fill("Cliente E2E");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("claveSegura123");
    await page.locator("form").getByRole("button", { name: "Crear cuenta" }).click();
    await page.waitForURL("/");

    await page.getByRole("button", { name: "Cuenta" }).click();
    await expect(page.getByText("Cliente E2E")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL("/login");
  });

  test("login con credenciales incorrectas muestra un error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("maria.fernandez@gmail.com");
    await page.locator("#password").fill("contraseña-incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Email o contraseña incorrectos")).toBeVisible();
  });

  test("login con las credenciales semilla funciona", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("maria.fernandez@gmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/");
  });
});
