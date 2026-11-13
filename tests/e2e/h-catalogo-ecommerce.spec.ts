import { test, expect, type Page } from "@playwright/test";

// NovaStore es un e-commerce: el personal mantiene el catálogo (pausar,
// archivar, restaurar) y los proveedores son solo datos.

async function entrarComo(page: Page, email: string, destino: RegExp) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("NovaStore2026!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(destino);
}

test.describe("h. Catálogo de un e-commerce", () => {
  test("ya no existe la postulación de vendedores", async ({ page }) => {
    await page.goto("/vender");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Vende en NovaStore" })).toHaveCount(0);
  });

  test("pausar saca un producto de la tienda, reactivar lo devuelve; archivar y restaurar", async ({ page, browser }) => {
    await entrarComo(page, "catalogo@novastore.pe", /admin\/productos/);
    const nombre = "Set de Velas Aromáticas";
    const tienda = await (await browser.newContext()).newPage();

    // Pausar
    await page.goto("/admin/productos?estado=publicado");
    await page.getByRole("button", { name: `Pausar ${nombre}` }).click();
    await expect(page.getByText(`"${nombre}" pausado`)).toBeVisible();
    await tienda.goto(`/?q=${encodeURIComponent(nombre)}`);
    await expect(tienda.getByText(nombre)).toHaveCount(0);

    // Reactivar desde la pestaña Pausados
    await page.goto("/admin/productos?estado=pausado");
    await page.getByRole("button", { name: `Reactivar ${nombre}` }).click();
    await expect(page.getByText(`"${nombre}" vuelve a estar a la venta`)).toBeVisible();
    await tienda.goto(`/?q=${encodeURIComponent(nombre)}`);
    await expect(tienda.getByText(nombre).first()).toBeVisible();

    // Archivar (con confirmación) y restaurar: queda pausado, luego se reactiva.
    await page.goto("/admin/productos?estado=publicado");
    await page.getByRole("button", { name: `Archivar ${nombre}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archivar" }).click();
    await expect(page.getByText(`"${nombre}" archivado`)).toBeVisible();

    await page.goto("/admin/productos?estado=archivado");
    await page.getByRole("button", { name: `Restaurar ${nombre}` }).click();
    await expect(page.getByText(`"${nombre}" restaurado`)).toBeVisible();
    await page.goto("/admin/productos?estado=pausado");
    await page.getByRole("button", { name: `Reactivar ${nombre}` }).click();
    await expect(page.getByText(`"${nombre}" vuelve a estar a la venta`)).toBeVisible();
    await tienda.close();
  });

  test("lo que nunca se vendió se puede eliminar; lo vendido solo se archiva", async ({ page }) => {
    await entrarComo(page, "admin@novastore.pe", /admin\/dashboard/);
    await page.goto("/admin/productos?estado=publicado");

    // Audífonos Inalámbricos Pro tiene pedidos en los datos semilla.
    await expect(page.getByRole("button", { name: "Archivar Audífonos Inalámbricos Pro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Eliminar definitivamente Audífonos Inalámbricos Pro" })).toHaveCount(0);

    // Kit de Limpieza del Hogar nunca se vendió.
    const nombre = "Kit de Limpieza del Hogar";
    await page.getByRole("button", { name: `Eliminar definitivamente ${nombre}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText(`"${nombre}" eliminado definitivamente.`)).toBeVisible();
    for (const estado of ["publicado", "archivado"]) {
      await page.goto(`/admin/productos?estado=${estado}`);
      await expect(page.getByText(nombre, { exact: true })).toHaveCount(0);
    }
  });

  test("el admin registra un proveedor y aparece en el formulario de producto", async ({ page }) => {
    await entrarComo(page, "admin@novastore.pe", /admin\/dashboard/);
    const proveedor = `Distribuidora E2E ${Date.now()}`;

    await page.goto("/admin/proveedores");
    await page.getByRole("button", { name: "Nuevo proveedor" }).click();
    await page.getByLabel("Nombre comercial").fill(proveedor);
    await page.getByLabel("RUC (opcional)").fill("20123456789".slice(0, 2) + String(Date.now()).slice(-9));
    await page.getByRole("button", { name: "Guardar proveedor" }).click();
    await expect(page.getByText(`Proveedor "${proveedor}" agregado.`)).toBeVisible();
    await expect(page.getByRole("cell", { name: proveedor, exact: true })).toBeVisible();

    await page.goto("/admin/productos/nuevo");
    await expect(page.locator("#proveedorId").getByRole("option", { name: proveedor })).toHaveCount(1);
  });

  test("el admin crea un empleado: entra con la temporal, la cambia, y al desactivarlo ya no entra", async ({ page, browser }) => {
    await entrarComo(page, "admin@novastore.pe", /admin\/dashboard/);
    const email = `empleado-e2e-${Date.now()}@novastore.pe`;

    await page.goto("/admin/personal");
    await page.getByRole("button", { name: "Nuevo empleado" }).click();
    await page.getByLabel("Nombre completo").fill("Empleado E2E");
    await page.getByLabel("Correo de la empresa").fill(email);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    const temporal = (await page.getByTestId("password-temporal").textContent())!.trim();
    expect(temporal).toHaveLength(12);

    // El empleado entra con la temporal y el panel le exige cambiarla.
    const empleado = await (await browser.newContext()).newPage();
    await empleado.goto("/admin/login");
    await empleado.locator("#email").fill(email);
    await empleado.locator("#password").fill(temporal);
    await empleado.getByRole("button", { name: "Ingresar" }).click();
    await empleado.waitForURL(/admin\/cambiar-clave/);
    await empleado.goto("/admin/productos");
    await empleado.waitForURL(/admin\/cambiar-clave/); // no puede saltárselo

    await empleado.getByLabel("Contraseña temporal").fill(temporal);
    await empleado.getByLabel("Nueva contraseña", { exact: true }).fill("ClaveDelEmpleado2026");
    await empleado.getByLabel("Repite la nueva contraseña").fill("ClaveDelEmpleado2026");
    await empleado.getByRole("button", { name: "Guardar contraseña" }).click();
    await empleado.waitForURL(/admin\/productos/);

    // El admin lo desactiva: su sesión deja de valer y no puede volver a entrar.
    await page.reload();
    const fila = page.getByRole("row").filter({ hasText: email });
    await fila.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText("Empleado E2E ya no puede ingresar.")).toBeVisible();

    await empleado.goto("/admin/productos");
    await empleado.waitForURL(/admin\/login/);
    await empleado.locator("#email").fill(email);
    await empleado.locator("#password").fill("ClaveDelEmpleado2026");
    await empleado.getByRole("button", { name: "Ingresar" }).click();
    await expect(empleado.getByText(/desactivada/)).toBeVisible();
  });

  test("CATALOGO no puede entrar a Personal", async ({ page }) => {
    await entrarComo(page, "catalogo@novastore.pe", /admin\/productos/);
    await page.goto("/admin/personal");
    await page.waitForURL(/admin\/productos/);
  });
});
