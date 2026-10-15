import { describe, expect, it } from "vitest";
import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  it("crea una cuenta nueva y abre sesión", async () => {
    const response = await POST(
      postRequest({
        name: "Usuario Nuevo",
        email: `nuevo-${Date.now()}@example.com`,
        password: "claveSegura123",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.cookies.get("session")?.value).toBeTruthy();
  });

  it("ignora cualquier `role` enviado en el body: la cuenta siempre es CLIENT", async () => {
    const response = await POST(
      postRequest({
        name: "Intento De Admin",
        email: `intento-admin-${Date.now()}@example.com`,
        password: "claveSegura123",
        role: "ADMIN",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rechaza un email ya registrado con 409", async () => {
    const response = await POST(
      postRequest({
        name: "Duplicado",
        email: "admin@novastore.pe",
        password: "claveSegura123",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "Ya existe una cuenta con ese correo",
    });
  });

  it("rechaza una contraseña demasiado corta", async () => {
    const response = await POST(
      postRequest({
        name: "Alguien",
        email: `corta-${Date.now()}@example.com`,
        password: "123",
      }),
    );
    expect(response.status).toBe(400);
  });
});
