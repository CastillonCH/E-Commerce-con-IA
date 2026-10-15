import { describe, expect, it } from "vitest";
import { canManageProducts, sessionCookieOptions } from "@/lib/auth";

describe("canManageProducts", () => {
  it("permite ADMIN y SELLER", () => {
    expect(canManageProducts("ADMIN")).toBe(true);
    expect(canManageProducts("SELLER")).toBe(true);
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
});
