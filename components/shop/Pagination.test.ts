import { describe, expect, it } from "vitest";
import { pageWindow } from "@/components/shop/Pagination";

describe("pageWindow", () => {
  it("muestra todas las páginas cuando son pocas", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it("colapsa los extremos con … en catálogos grandes", () => {
    expect(pageWindow(1, 180)).toEqual([1, 2, 3, "…", 180]);
    expect(pageWindow(50, 180)).toEqual([1, "…", 48, 49, 50, 51, 52, "…", 180]);
    expect(pageWindow(180, 180)).toEqual([1, "…", 178, 179, 180]);
  });

  it("no pone … cuando el hueco es de cero páginas", () => {
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
