import { test, expect, type Page } from "@playwright/test";

// "La IA primero": quien carga sube la foto, escribe nombre y descripción,
// y la IA (aquí el mock, en modo demo) propone departamento y categoría
// ANTES de guardar. La persona solo confirma o corrige.

async function entrarComo(page: Page, email: string, destino: RegExp) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("NovaStore2026!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(destino);
}

const FOTO = { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]) };

async function llenarFotoYTexto(page: Page, nombre: string) {
  await page.locator('input[type="file"]').setInputFiles(FOTO);
  await page.locator("#nombre").fill(nombre);
  await page.locator("#descripcion").fill("Producto de prueba para la carga asistida por la IA en E2E.");
}

test.describe("i. Carga asistida por la IA", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("http://localhost:8099/mock-control/caida", { data: { caida: false } });
  });

  test("la IA propone departamento y categoría antes de guardar; se guarda y se carga otro", async ({ page }) => {
    await entrarComo(page, "catalogo@novastore.pe", /admin\/productos/);
    await page.goto("/admin/productos/nuevo");

    await llenarFotoYTexto(page, "Audífonos Asistidos E2E");
    const sugerencia = page.getByRole("region", { name: "Sugerencia de la IA" });
    await expect(sugerencia.getByText("Audio y audífonos", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Prellenado: la persona no tuvo que elegir nada.
    await expect(page.locator("#departamento")).toHaveValue("Electrónica");
    await expect(page.locator("#categoriaManual")).toHaveValue("Audio y audífonos");
    await expect(page.getByText("Es la que propuso la IA.")).toBeVisible();

    await page.locator("#precio").fill("99.90");
    await page.locator("#stock").fill("5");
    await page.locator("#marca").fill("SoundMax");
    await page.getByRole("button", { name: "Guardar producto" }).click();

    await expect(page.getByText(/La IA sugiere: Audio y audífonos/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Cargar otro producto" }).click();
    await expect(page.locator("#nombre")).toHaveValue("");
    await expect(page.getByTestId("mis-numeros")).toBeVisible();
  });

  test("corregir con una alternativa la marca como cambiada (la revisará un admin)", async ({ page }) => {
    await entrarComo(page, "catalogo@novastore.pe", /admin\/productos/);
    await page.goto("/admin/productos/nuevo");

    await llenarFotoYTexto(page, "Laptop Corregida E2E");
    const sugerencia = page.getByRole("region", { name: "Sugerencia de la IA" });
    await sugerencia.getByRole("button", { name: /Laptops y computadoras/ }).click({ timeout: 15_000 });

    await expect(page.locator("#categoriaManual")).toHaveValue("Laptops y computadoras");
    await expect(page.getByText(/La cambiaste/)).toBeVisible();
    await sugerencia.getByRole("button", { name: "Usar sugerencia" }).click();
    await expect(page.locator("#categoriaManual")).toHaveValue("Audio y audífonos");
  });

  test("con la IA caída el formulario avisa y se elige a mano", async ({ page, request }) => {
    await request.post("http://localhost:8099/mock-control/caida", { data: { caida: true } });
    await entrarComo(page, "catalogo@novastore.pe", /admin\/productos/);
    await page.goto("/admin/productos/nuevo");

    await llenarFotoYTexto(page, "Producto Sin Sugerencia E2E");
    await expect(page.getByText(/La IA no está disponible en este momento/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#departamento")).toHaveValue("");
    await page.locator("#departamento").selectOption("Electrónica");
    await expect(page.locator("#categoriaManual")).toBeEnabled();
    await request.post("http://localhost:8099/mock-control/caida", { data: { caida: false } });
  });

  test("el admin ve el tiempo de carga sin IA vs con IA", async ({ page }) => {
    await entrarComo(page, "admin@novastore.pe", /admin\/dashboard/);
    await page.goto("/admin/modelos");
    await expect(page.getByRole("heading", { name: "Tiempo de carga por ficha: sin IA vs con IA" })).toBeVisible();
    await expect(page.getByText(/Con IA \(\d+ fichas\)/)).toBeVisible();
  });

  test("el admin cambia a un empleado a 'Sin IA' y el formulario cambia al instante, sin reiniciar", async ({ page, browser }) => {
    await entrarComo(page, "admin@novastore.pe", /admin\/dashboard/);
    const selector = page.getByLabel("Carga de productos de Analista de Catálogo");

    await page.goto("/admin/personal");
    await selector.selectOption("manual");
    await expect(page.getByText("Analista de Catálogo ahora carga sin IA.")).toBeVisible();

    const catalogo = await (await browser.newContext()).newPage();
    await entrarComo(catalogo, "catalogo@novastore.pe", /admin\/productos/);
    await catalogo.goto("/admin/productos/nuevo");
    await expect(catalogo.getByTestId("modo-carga")).toHaveText("Sin IA (medición)");
    await expect(catalogo.getByRole("region", { name: "Sugerencia de la IA" })).toHaveCount(0);

    // Vuelve a "Con IA": basta con recargar el formulario.
    await selector.selectOption("asistido");
    await expect(page.getByText("Analista de Catálogo ahora carga con IA.")).toBeVisible();
    await catalogo.reload();
    await expect(catalogo.getByTestId("modo-carga")).toHaveText("Con IA");
    await expect(catalogo.getByRole("region", { name: "Sugerencia de la IA" })).toBeVisible();
  });
});
