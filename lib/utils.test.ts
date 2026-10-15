import { describe, expect, it } from "vitest";
import { cn, formatCurrency, discountPercent } from "@/lib/utils";

describe("cn", () => {
  it("combina clases y resuelve conflictos de Tailwind (la última gana)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignora valores falsy", () => {
    expect(cn("text-sm", false, undefined, null, "font-bold")).toBe(
      "text-sm font-bold",
    );
  });
});

describe("formatCurrency", () => {
  it("formatea un monto en soles peruanos", () => {
    expect(formatCurrency(1234.5)).toContain("1,234.50");
  });
});

describe("discountPercent", () => {
  it("devuelve null sin precio original", () => {
    expect(discountPercent(100)).toBeNull();
  });

  it("devuelve null si el precio original no es mayor al precio actual", () => {
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(100, 90)).toBeNull();
  });

  it("calcula el porcentaje de descuento redondeado", () => {
    expect(discountPercent(75, 100)).toBe(25);
    expect(discountPercent(289.9, 349.9)).toBe(17);
  });
});
