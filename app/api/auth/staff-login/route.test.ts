import { describe, expect, it } from "vitest";
import { POST } from "./route";

const DEMO_PASSWORD = "NovaStore2026!";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/auth/staff-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/staff-login", () => {
  it("permite el login de un ADMIN con credenciales correctas", async () => {
    const response = await POST(
      postRequest({ email: "admin@novastore.pe", password: DEMO_PASSWORD }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, role: "ADMIN" });
    expect(response.cookies.get("session")?.value).toBeTruthy();
  });

  it("rechaza una contraseña incorrecta con un error genérico", async () => {
    const response = await POST(
      postRequest({ email: "admin@novastore.pe", password: "wrong-password" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Email o contraseña incorrectos",
    });
  });

  it("rechaza un email que no existe con el mismo error genérico", async () => {
    const response = await POST(
      postRequest({ email: "nadie@novastore.pe", password: DEMO_PASSWORD }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      detail: "Email o contraseña incorrectos",
    });
  });

  it("rechaza a un CLIENT aunque la contraseña sea correcta", async () => {
    const response = await POST(
      postRequest({
        email: "maria.fernandez@gmail.com",
        password: DEMO_PASSWORD,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("ignora cualquier `role` enviado en el body: el rol siempre viene del repositorio", async () => {
    const response = await POST(
      postRequest({
        email: "contacto@soundmax.pe",
        password: DEMO_PASSWORD,
        role: "ADMIN",
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.role).toBe("SELLER");
  });

  it("rechaza un body con forma inválida", async () => {
    const response = await POST(postRequest({ email: "no-es-un-email" }));
    expect(response.status).toBe(400);
  });
});
