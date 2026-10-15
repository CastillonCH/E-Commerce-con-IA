import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";

describe("safeRedirect", () => {
  it("permite una ruta interna normal", () => {
    expect(safeRedirect("/perfil")).toBe("/perfil");
  });

  it("usa el fallback para null/undefined/vacío", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });

  it("usa el fallback personalizado", () => {
    expect(safeRedirect(null, "/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("rechaza URLs absolutas (open redirect)", () => {
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("http://evil.com/phish")).toBe("/");
  });

  it("rechaza protocol-relative URLs (//evil.com)", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
  });

  it("rechaza rutas con backslash (/\\evil.com)", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
  });
});
