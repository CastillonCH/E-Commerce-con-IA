import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { crearMiembroPersonal, setMiembroActivo } from "@/lib/data/users-repo";

const DEMO_PASSWORD = "NovaStore2026!";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/auth/staff-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Pruebas de integración: findUserByEmail ya consulta PostgreSQL real
// (ver tests/db-global-setup.ts). Se saltan sin DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/staff-login", () => {
  it("permite el login de un ADMIN con credenciales correctas", async () => {
    const response = await POST(
      postRequest({ email: "admin@novastore.pe", password: DEMO_PASSWORD }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, role: "ADMIN", debeCambiarPassword: false });
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
        email: "catalogo@novastore.pe",
        password: DEMO_PASSWORD,
        role: "ADMIN",
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.role).toBe("CATALOGO");
  });

  it("una cuenta nueva entra con su contraseña temporal y se le pide cambiarla", async () => {
    const email = `staff-temporal-${Date.now()}@novastore.pe`;
    const { passwordTemporal } = await crearMiembroPersonal({ nombre: "Temporal", email, rol: "CATALOGO" });
    const response = await POST(postRequest({ email, password: passwordTemporal }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, role: "CATALOGO", debeCambiarPassword: true });
  });

  it("una cuenta desactivada no entra, aunque la contraseña sea correcta", async () => {
    const email = `staff-inactivo-${Date.now()}@novastore.pe`;
    const { id, passwordTemporal } = await crearMiembroPersonal({ nombre: "Inactivo", email, rol: "CATALOGO" });
    await setMiembroActivo(id, false, "admin@novastore.pe");
    const response = await POST(postRequest({ email, password: passwordTemporal }));
    expect(response.status).toBe(403);
    expect((await response.json()).detail).toMatch(/desactivada/);
    expect(response.cookies.get("session")).toBeUndefined();
  });

  it("rechaza un body con forma inválida", async () => {
    const response = await POST(postRequest({ email: "no-es-un-email" }));
    expect(response.status).toBe(400);
  });
});
