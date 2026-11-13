import { describe, expect, it } from "vitest";
import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Pruebas de integración: findUserByEmail ya consulta PostgreSQL real
// (ver tests/db-global-setup.ts). Se saltan sin DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/login", () => {
  it("permite el login de un CLIENT con credenciales correctas", async () => {
    const response = await POST(
      postRequest({
        email: "maria.fernandez@gmail.com",
        password: "NovaStore2026!",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.cookies.get("session")?.value).toBeTruthy();
  });

  it("rechaza al personal (ADMIN/CATALOGO): su puerta es /admin/login", async () => {
    for (const email of ["admin@novastore.pe", "catalogo@novastore.pe"]) {
      const response = await POST(postRequest({ email, password: "NovaStore2026!" }));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ staff: true });
      expect(response.cookies.get("session")).toBeUndefined();
    }
  });

  it("con la contraseña incorrecta, una cuenta del personal da el mismo error genérico", async () => {
    // No debe revelar que el correo es de un administrador.
    const response = await POST(
      postRequest({ email: "admin@novastore.pe", password: "incorrecta" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Email o contraseña incorrectos" });
  });

  it("rechaza una contraseña incorrecta con un error genérico", async () => {
    const response = await POST(
      postRequest({
        email: "maria.fernandez@gmail.com",
        password: "incorrecta",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Email o contraseña incorrectos",
    });
  });

  it("rechaza un email que no existe", async () => {
    const response = await POST(
      postRequest({ email: "nadie@example.com", password: "NovaStore2026!" }),
    );
    expect(response.status).toBe(401);
  });

  it("rechaza un body con forma inválida", async () => {
    const response = await POST(postRequest({ email: "no-es-un-email" }));
    expect(response.status).toBe(400);
  });
});
