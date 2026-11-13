import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { signSession, verifySession } from "@/lib/session";

const payload = {
  role: "ADMIN" as const,
  name: "Admin NovaStore",
  email: "admin@novastore.pe",
  provider: "credentials" as const,
};

describe("signSession / verifySession", () => {
  it("verifica un token recién firmado y devuelve el mismo payload", async () => {
    const token = await signSession(payload);
    const session = await verifySession(token);
    expect(session).toEqual(payload);
  });

  it("el token del personal vence a las 2 horas y el del cliente a las 8", async () => {
    const duracion = async (role: "ADMIN" | "CATALOGO" | "CLIENT") => {
      const { exp, iat } = decodeJwt(await signSession({ ...payload, role }));
      return exp! - iat!;
    };
    expect(await duracion("ADMIN")).toBe(2 * 60 * 60);
    expect(await duracion("CATALOGO")).toBe(2 * 60 * 60);
    expect(await duracion("CLIENT")).toBe(8 * 60 * 60);
  });

  it("devuelve null para undefined", async () => {
    expect(await verifySession(undefined)).toBeNull();
  });

  it("devuelve null para un token manipulado", async () => {
    const token = await signSession(payload);
    const tampered = token.slice(0, -2) + "xx";
    expect(await verifySession(tampered)).toBeNull();
  });

  it("devuelve null para un token firmado con otro secreto", async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-completely-different-secret-value-32ch";
    const tokenFromOtherSecret = await signSession(payload);
    process.env.AUTH_SECRET = original;

    expect(await verifySession(tokenFromOtherSecret)).toBeNull();
  });

  it("devuelve null para un payload con un rol inválido", async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET =
      original ?? "test-only-secret-key-for-vitest-32chars!!";

    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(process.env.AUTH_SECRET);
    const badToken = await new SignJWT({
      role: "SUPERUSER",
      name: "x",
      email: "x@x.com",
      provider: "credentials",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(key);

    expect(await verifySession(badToken)).toBeNull();
  });
});
