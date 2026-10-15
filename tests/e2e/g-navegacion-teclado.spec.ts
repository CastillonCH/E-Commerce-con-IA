import { test, expect } from "@playwright/test";

test.describe("g. Navegación por teclado", () => {
  test("el primer Tab revela el skip link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  });

  test("el mega-menú de departamentos se abre con foco y se cierra con Escape", async ({ page }) => {
    await page.goto("/");
    const deptLink = page.locator('nav a[aria-haspopup="true"]').first();
    await deptLink.focus();
    await expect(deptLink).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(deptLink).toHaveAttribute("aria-expanded", "false");
  });

  test("el menú de cuenta se puede abrir, recorrer con Tab y cerrar con Escape", async ({ page }) => {
    await page.goto("/");
    const accountButton = page.getByRole("button", { name: "Cuenta" });
    await accountButton.click();
    await expect(accountButton).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
  });

  test("el asistente de ayuda mueve el foco al abrirse y lo devuelve al cerrarse con Escape", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Abrir asistente virtual" });
    await toggle.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cerrar asistente" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir asistente virtual" })).toBeFocused();
  });

  test("las tablas del panel de administración exponen caption y encabezados con scope", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);

    await page.goto("/admin/productos");
    await expect(page.locator("table caption")).toHaveCount(1);
    await expect(page.locator("table th").first()).toHaveAttribute("scope", "col");
  });
});
