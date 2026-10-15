import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const AXE_SOURCE = fs.readFileSync(
  path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
  "utf-8",
);

interface AxeViolation {
  id: string;
  impact?: string | null;
  description: string;
}

// Solo falla ante violaciones "critical" o "serious": un hallazgo "moderate"
// o "minor" se reporta pero no bloquea el pipeline, para no acoplar el CI a
// cada detalle cosmético de contraste de axe-core.
async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    // @ts-expect-error -- axe se inyecta en tiempo de ejecución vía addScriptTag
    const results = await window.axe.run();
    return results.violations;
  });
}

function hasBlockingViolations(violations: AxeViolation[]): boolean {
  return violations.some(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
}

test.describe("f. Accesibilidad (axe-core)", () => {
  // Las tarjetas de producto entran con una animación de fade-in
  // (animate-[fade-up_...]); si axe analiza la página a mitad de esa
  // transición, reporta contraste insuficiente sobre colores que todavía
  // están en su estado intermedio (opacity < 1), no sobre el color final
  // ya renderizado. Emular prefers-reduced-motion activa la regla global
  // de app/globals.css que colapsa esas animaciones a ~0, evitando ese
  // falso positivo y, de paso, probando el modo de movimiento reducido.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("home sin violaciones críticas o serias", async ({ page }) => {
    await page.goto("/");
    const violations = await runAxe(page);
    expect(hasBlockingViolations(violations), JSON.stringify(violations, null, 2)).toBe(false);
  });

  test("página de login sin violaciones críticas o serias", async ({ page }) => {
    await page.goto("/login");
    const violations = await runAxe(page);
    expect(hasBlockingViolations(violations), JSON.stringify(violations, null, 2)).toBe(false);
  });

  test("detalle de producto sin violaciones críticas o serias", async ({ page }) => {
    await page.goto("/productos/1");
    const violations = await runAxe(page);
    expect(hasBlockingViolations(violations), JSON.stringify(violations, null, 2)).toBe(false);
  });

  test("panel de administración (dashboard) sin violaciones críticas o serias", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@novastore.pe");
    await page.locator("#password").fill("NovaStore2026!");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/admin\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const violations = await runAxe(page);
    expect(hasBlockingViolations(violations), JSON.stringify(violations, null, 2)).toBe(false);
  });
});
