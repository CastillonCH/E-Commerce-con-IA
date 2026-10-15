import { test, expect } from "@playwright/test";

test.describe("a. Catálogo", () => {
  test("la home carga y muestra productos destacados", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /productos destacados/i })).toBeVisible();
    await expect(page.getByText("Audífonos Inalámbricos Pro").first()).toBeVisible();
  });

  test("la búsqueda filtra el catálogo", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Buscar productos...").fill("Sofá");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=Sof/);
    await expect(page.getByText("Sofá Modular 3 Cuerpos")).toBeVisible();
  });

  test("filtrar por departamento usa el parámetro `departamento`", async ({ page }) => {
    await page.goto("/?departamento=Moda");
    await expect(page).toHaveURL(/departamento=Moda/);
    await expect(page.getByRole("heading", { name: "Moda" })).toBeVisible();
  });

  test("la página de un producto muestra su detalle y productos relacionados", async ({ page }) => {
    await page.goto("/productos/1");
    await expect(page.getByRole("heading", { name: "Audífonos Inalámbricos Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Productos relacionados" })).toBeVisible();
  });
});
