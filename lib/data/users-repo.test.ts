import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/db";
import {
  findUserByEmail,
  verifyPassword,
  createClient,
  upsertGoogleUser,
  listClients,
  listPersonal,
  crearMiembroPersonal,
  setMiembroActivo,
  setMiembroRol,
  restablecerPasswordMiembro,
  cambiarPassword,
  generarPasswordTemporal,
  PersonalError,
} from "@/lib/data/users-repo";

// Pruebas de integración contra una PostgreSQL real (ver
// tests/db-global-setup.ts): se saltan si no hay DATABASE_URL, en vez de
// fallar, para que `npm test` siga funcionando sin una base levantada.
const DEMO_PASSWORD = "NovaStore2026!";

describe.skipIf(!process.env.DATABASE_URL)(
  "users-repo (integración con PostgreSQL)",
  () => {
    afterAll(async () => {
      await closePool();
    });

    describe("findUserByEmail / verifyPassword", () => {
      it("encuentra un usuario sembrado sin distinguir mayúsculas/minúsculas", async () => {
        const user = await findUserByEmail("ADMIN@novastore.pe");
        expect(user?.email).toBe("admin@novastore.pe");
        expect(user?.role).toBe("ADMIN");
      });

      it("devuelve null para un email que no existe", async () => {
        expect(await findUserByEmail("nadie@novastore.pe")).toBeNull();
      });

      it("verifyPassword acepta la contraseña correcta y rechaza una incorrecta", async () => {
        const user = await findUserByEmail("admin@novastore.pe");
        expect(await verifyPassword(user!, DEMO_PASSWORD)).toBe(true);
        expect(await verifyPassword(user!, "contraseña-incorrecta")).toBe(false);
      });
    });

    describe("createClient", () => {
      it("crea un cliente nuevo con rol CLIENT", async () => {
        const email = `nuevo-cliente-test-${Date.now()}@example.com`;
        const user = await createClient({
          name: "Nuevo Cliente",
          email,
          password: "unaClaveSegura123",
        });
        expect(user.role).toBe("CLIENT");
        expect(await findUserByEmail(email)).not.toBeNull();
      });

      it("rechaza un email ya registrado", async () => {
        await expect(
          createClient({
            name: "Duplicado",
            email: "admin@novastore.pe",
            password: "otraClave123",
          }),
        ).rejects.toThrow("Ya existe una cuenta con ese correo");
      });
    });

    describe("upsertGoogleUser", () => {
      it("crea un cliente nuevo la primera vez", async () => {
        const email = `google-nuevo-test-${Date.now()}@example.com`;
        const user = await upsertGoogleUser({
          sub: `sub-${Date.now()}`,
          email,
          name: "Usuario Google",
        });
        expect(user.role).toBe("CLIENT");
      });

      it("es idempotente: una segunda llamada con el mismo email devuelve el mismo usuario", async () => {
        const email = `google-idempotente-test-${Date.now()}@example.com`;
        const first = await upsertGoogleUser({ sub: "sub-a", email, name: "Primero" });
        const second = await upsertGoogleUser({ sub: "sub-a", email, name: "Segundo" });
        expect(second.id).toBe(first.id);
      });
    });

    describe("roles del personal", () => {
      it("catalogo@novastore.pe es personal de catálogo (CATALOGO), no administrador", async () => {
        expect((await findUserByEmail("catalogo@novastore.pe"))?.role).toBe("CATALOGO");
      });
    });

    describe("cuentas del personal (/admin/personal)", () => {
      const ADMIN = "admin@novastore.pe";

      it("genera contraseñas temporales distintas, sin caracteres confusos", () => {
        const a = generarPasswordTemporal();
        expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
        expect(generarPasswordTemporal()).not.toBe(a);
      });

      it("el admin crea un empleado: contraseña temporal y cambio obligatorio", async () => {
        const email = `empleado-${Date.now()}@novastore.pe`;
        const { passwordTemporal } = await crearMiembroPersonal({ nombre: "Empleado Nuevo", email, rol: "CATALOGO" });

        const usuario = await findUserByEmail(email);
        expect(usuario).toMatchObject({ role: "CATALOGO", activo: true, debeCambiarPassword: true });
        expect(await verifyPassword(usuario!, passwordTemporal)).toBe(true);
        expect((await listPersonal()).some((m) => m.email === email)).toBe(true);

        // Elige su propia contraseña y deja de estar obligado a cambiarla.
        expect(await cambiarPassword(email, "incorrecta", "OtraClave2026")).toBe("actual_incorrecta");
        expect(await cambiarPassword(email, passwordTemporal, passwordTemporal)).toBe("igual_a_la_actual");
        expect(await cambiarPassword(email, passwordTemporal, "MiClavePropia2026")).toBe("ok");
        const despues = await findUserByEmail(email);
        expect(despues?.debeCambiarPassword).toBe(false);
        expect(await verifyPassword(despues!, "MiClavePropia2026")).toBe(true);
      });

      it("no crea un empleado con el correo de un cliente existente", async () => {
        await expect(
          crearMiembroPersonal({ nombre: "Duplicado", email: "maria.fernandez@gmail.com", rol: "CATALOGO" }),
        ).rejects.toBeInstanceOf(PersonalError);
        expect((await findUserByEmail("maria.fernandez@gmail.com"))?.role).toBe("CLIENT");
      });

      it("desactivar, reactivar, cambiar de rol y restablecer la contraseña", async () => {
        const email = `rotacion-${Date.now()}@novastore.pe`;
        const { id } = await crearMiembroPersonal({ nombre: "Empleado Rotación", email, rol: "CATALOGO" });

        await setMiembroActivo(id, false, ADMIN);
        expect((await findUserByEmail(email))?.activo).toBe(false);
        await setMiembroActivo(id, true, ADMIN);
        await setMiembroRol(id, "ADMIN", ADMIN);
        expect((await findUserByEmail(email))?.role).toBe("ADMIN");

        const nueva = await restablecerPasswordMiembro(id, ADMIN);
        const usuario = await findUserByEmail(email);
        expect(usuario?.debeCambiarPassword).toBe(true);
        expect(await verifyPassword(usuario!, nueva)).toBe(true);
      });

      it("nadie cambia su propia cuenta, y nunca se toca a un cliente desde aquí", async () => {
        const admin = await findUserByEmail(ADMIN);
        await expect(setMiembroActivo(admin!.id, false, ADMIN)).rejects.toThrow(/propia cuenta/);
        const cliente = await findUserByEmail("jorge.salazar@gmail.com");
        await expect(setMiembroRol(cliente!.id, "ADMIN", ADMIN)).rejects.toThrow(/no es del personal/);
        expect((await findUserByEmail("jorge.salazar@gmail.com"))?.role).toBe("CLIENT");
      });

      it("nunca queda el sistema sin un administrador activo", async () => {
        // Otro admin intenta desactivar al único admin original: si es el
        // último activo, la base lo impide. Se desactivan primero los demás
        // admins que crearon otros tests.
        const otro = `ultimo-${Date.now()}@novastore.pe`;
        const { id: otroId } = await crearMiembroPersonal({ nombre: "Admin Temporal", email: otro, rol: "ADMIN" });
        for (const m of await listPersonal()) {
          if (m.rol === "ADMIN" && m.activo && m.email !== ADMIN && m.id !== otroId) {
            await setMiembroActivo(m.id, false, ADMIN);
          }
        }
        await setMiembroActivo(otroId, false, ADMIN); // queda solo admin@
        const admin = await findUserByEmail(ADMIN);
        await expect(setMiembroActivo(admin!.id, false, otro)).rejects.toThrow(/al menos un administrador/);
        await expect(setMiembroRol(admin!.id, "CATALOGO", otro)).rejects.toThrow(/al menos un administrador/);
      });
    });

    describe("listClients", () => {
      it("listClients solo incluye usuarios con rol CLIENT", async () => {
        const clients = await listClients();
        expect(clients.length).toBeGreaterThan(0);
        expect(clients.every((u) => u.role === "CLIENT")).toBe(true);
      });
    });
  },
);
