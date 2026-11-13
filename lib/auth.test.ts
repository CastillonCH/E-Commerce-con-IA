import { describe, expect, it } from "vitest";
import { canManageProducts, sessionCookieOptions } from "@/lib/auth";

describe("canManageProducts", () => {
  it("permite al personal: ADMIN y CATALOGO", () => {
    expect(canManageProducts("ADMIN")).toBe(true);
    expect(canManageProducts("CATALOGO")).toBe(true);
  });

  it("rechaza CLIENT y null", () => {
    expect(canManageProducts("CLIENT")).toBe(false);
    expect(canManageProducts(null)).toBe(false);
  });
});

describe("sessionCookieOptions", () => {
  it("expone las opciones de seguridad esperadas para la cookie de sesión", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(60 * 60 * 8);
  });

  it("la cookie del personal dura 2 horas y la del cliente 8", () => {
    expect(sessionCookieOptions("ADMIN").maxAge).toBe(60 * 60 * 2);
    expect(sessionCookieOptions("CATALOGO").maxAge).toBe(60 * 60 * 2);
    expect(sessionCookieOptions("CLIENT").maxAge).toBe(60 * 60 * 8);
  });
});
