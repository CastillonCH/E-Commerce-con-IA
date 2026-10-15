import { test, expect } from "@playwright/test";

test.describe("c. Flujo de compra", () => {
  test("un cliente puede agregar al carrito, pagar, y ver el pedido en su historial", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("jorge.salazar@gmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/");

    await page.goto("/productos/1");
    await page.getByRole("button", { name: "Añadir al carrito" }).first().click();

    await page.goto("/checkout");
    await page.locator("#direccion").fill("Av. Siempre Viva 742");
    await page.locator("#ciudad").fill("Lima");
    await page.locator("#telefono").fill("987654321");
    await page.getByRole("button", { name: "Confirmar pedido" }).click();

    await page.waitForURL(/checkout\/confirmacion/);
    await expect(page.getByRole("heading", { name: "¡Pedido confirmado!" })).toBeVisible();
    const orderId = await page
      .getByText(/^PED-/)
      .first()
      .textContent();

    await page.goto("/perfil/pedidos");
    await expect(page.getByText(orderId!.trim())).toBeVisible();
  });

  test("el carrito vacío no permite ir a pagar", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("lucia.torres@hotmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/");

    await page.goto("/checkout");
    await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
  });
});
