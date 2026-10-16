import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/db";
import {
  findUserByEmail,
  verifyPassword,
  createClient,
  upsertGoogleUser,
  promoteToSeller,
  listClients,
  listSellers,
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

    describe("promoteToSeller", () => {
      it("promueve a un cliente existente a SELLER", async () => {
        const email = `futuro-vendedor-test-${Date.now()}@example.com`;
        await createClient({ name: "Futuro Vendedor", email, password: "unaClaveSegura123" });
        const promoted = await promoteToSeller({ email, nombre: "Futuro Vendedor" });
        expect(promoted.role).toBe("SELLER");
      });

      it("crea un nuevo SELLER si el email no existía", async () => {
        const email = `vendedor-inexistente-test-${Date.now()}@example.com`;
        const seller = await promoteToSeller({ email, nombre: "Marca Nueva" });
        expect(seller.role).toBe("SELLER");
        expect(await findUserByEmail(email)).not.toBeNull();
      });
    });

    describe("listClients / listSellers", () => {
      it("listClients solo incluye usuarios con rol CLIENT", async () => {
        const clients = await listClients();
        expect(clients.length).toBeGreaterThan(0);
        expect(clients.every((u) => u.role === "CLIENT")).toBe(true);
      });

      it("listSellers solo incluye usuarios con rol SELLER", async () => {
        const sellers = await listSellers();
        expect(sellers.length).toBeGreaterThan(0);
        expect(sellers.every((u) => u.role === "SELLER")).toBe(true);
      });
    });
  },
);
