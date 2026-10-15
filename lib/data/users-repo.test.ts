import { describe, expect, it } from "vitest";
import {
  findUserByEmail,
  verifyPassword,
  createClient,
  upsertGoogleUser,
  promoteToSeller,
  listClients,
  listSellers,
} from "@/lib/data/users-repo";

const DEMO_PASSWORD = "NovaStore2026!";

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
    const user = await createClient({
      name: "Nuevo Cliente",
      email: "nuevo-cliente-test@example.com",
      password: "unaClaveSegura123",
    });
    expect(user.role).toBe("CLIENT");
    expect(await findUserByEmail("nuevo-cliente-test@example.com")).not.toBeNull();
  });

  it("rechaza un email ya registrado", async () => {
    await expect(
      createClient({
        name: "Duplicado",
        email: "admin@novastore.pe",
        password: "otraClave123",
      }),
    ).rejects.toThrow();
  });
});

describe("upsertGoogleUser", () => {
  it("crea un cliente nuevo la primera vez", async () => {
    const user = await upsertGoogleUser({
      sub: "google-sub-123",
      email: "google-nuevo-test@example.com",
      name: "Usuario Google",
    });
    expect(user.role).toBe("CLIENT");
  });

  it("es idempotente: una segunda llamada con el mismo email devuelve el mismo usuario", async () => {
    const first = await upsertGoogleUser({
      sub: "google-sub-456",
      email: "google-idempotente-test@example.com",
      name: "Primero",
    });
    const second = await upsertGoogleUser({
      sub: "google-sub-456",
      email: "google-idempotente-test@example.com",
      name: "Segundo",
    });
    expect(second.id).toBe(first.id);
  });
});

describe("promoteToSeller", () => {
  it("promueve a un cliente existente a SELLER", async () => {
    await createClient({
      name: "Futuro Vendedor",
      email: "futuro-vendedor-test@example.com",
      password: "unaClaveSegura123",
    });
    const promoted = await promoteToSeller({
      email: "futuro-vendedor-test@example.com",
      nombre: "Futuro Vendedor",
    });
    expect(promoted.role).toBe("SELLER");
  });

  it("crea un nuevo SELLER si el email no existía", async () => {
    const seller = await promoteToSeller({
      email: "vendedor-inexistente-test@example.com",
      nombre: "Marca Nueva",
    });
    expect(seller.role).toBe("SELLER");
    expect(await findUserByEmail("vendedor-inexistente-test@example.com")).not.toBeNull();
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
