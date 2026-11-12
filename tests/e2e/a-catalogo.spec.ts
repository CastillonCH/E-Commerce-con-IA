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

  test("los enlaces viejos /?departamento= redirigen a la página del departamento", async ({ page }) => {
    await page.goto("/?departamento=Moda");
    await expect(page).toHaveURL(/\/categoria\/moda$/);
    await expect(page.getByRole("heading", { level: 1, name: "Moda" })).toBeVisible();
  });

  test("la página de categoría filtra por marca y ordena por precio", async ({ page }) => {
    await page.goto("/categoria/electronica/audio-y-audifonos");
    await expect(page.getByRole("heading", { level: 1, name: "Audio y audífonos" })).toBeVisible();
    await expect(page.getByText("Audífonos Inalámbricos Pro").first()).toBeVisible();

    await page.getByLabel("Ordenar por:").selectOption("precio-desc");
    await expect(page).toHaveURL(/orden=precio-desc/);

    await page.goto("/categoria/electronica/audio-y-audifonos?marca=NoExiste");
    await expect(page.getByText("Ningún producto coincide con los filtros")).toBeVisible();
  });

  // Con loading.tsx la respuesta ya empezó a transmitirse (200) cuando la
  // página llama a notFound(), así que se comprueba lo que se muestra.
  test("una categoría que no existe muestra la página 404", async ({ page }) => {
    await page.goto("/categoria/electronica/no-existe");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("la página de un producto muestra su detalle y productos relacionados", async ({ page }) => {
    await page.goto("/productos/1");
    await expect(page.getByRole("heading", { name: "Audífonos Inalámbricos Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Productos relacionados" })).toBeVisible();
  });
});
