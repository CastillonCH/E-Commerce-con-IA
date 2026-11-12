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

  test("sin sesión no se agrega nada: pide login y, al ingresar, agrega el producto", async ({ page }) => {
    await page.goto("/productos/1");
    await page.getByRole("button", { name: "Añadir al carrito" }).first().click();

    await page.waitForURL(/\/login\?from=%2Fproductos%2F1/);
    const carritoAntes = await page.evaluate(() => JSON.parse(localStorage.getItem("cart-storage") ?? "{}"));
    expect(carritoAntes.state?.items ?? []).toHaveLength(0);

    await page.locator("#email").fill("jorge.salazar@gmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/productos/1");

    await expect(page.getByText("Audífonos Inalámbricos Pro añadido al carrito")).toBeVisible();
    await page.goto("/carrito");
    await expect(page.getByText("Audífonos Inalámbricos Pro")).toBeVisible();
  });

  test("Comprar ahora va al checkout solo con ese producto y no toca el carrito", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("lucia.torres@hotmail.com");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL("/");

    await page.goto("/productos/1");
    await page.getByRole("button", { name: "Aumentar cantidad" }).click();
    await page.getByRole("button", { name: "Comprar ahora" }).click();

    await page.waitForURL("/checkout?producto=1&cantidad=2");
    await expect(page.getByText("Compra directa: solo se paga este producto.")).toBeVisible();
    await expect(page.getByText("Cant. 2")).toBeVisible();
    const carrito = await page.evaluate(() => JSON.parse(localStorage.getItem("cart-storage") ?? "{}"));
    expect(carrito.state?.items ?? []).toHaveLength(0);
  });

  test("el botón Comprar del inicio lleva al catálogo completo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Comprar" }).click();
    await page.waitForURL("/productos");
    await expect(page.getByRole("heading", { level: 1, name: "Todos los productos" })).toBeVisible();
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
