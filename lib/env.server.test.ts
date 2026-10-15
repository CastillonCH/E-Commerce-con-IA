import { describe, expect, it } from "vitest";
import { getServerEnv } from "@/lib/env.server";

describe("getServerEnv", () => {
  it("devuelve AUTH_SECRET cuando está definido y es suficientemente largo", () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a".repeat(32);

    expect(getServerEnv().AUTH_SECRET).toBe("a".repeat(32));

    process.env.AUTH_SECRET = original;
  });

  it("lanza un error descriptivo si AUTH_SECRET es demasiado corto", () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "muy-corto";

    expect(() => getServerEnv()).toThrow(/AUTH_SECRET/);

    process.env.AUTH_SECRET = original;
  });

  it("lanza un error descriptivo si AUTH_SECRET no está definido", () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;

    expect(() => getServerEnv()).toThrow(/AUTH_SECRET/);

    process.env.AUTH_SECRET = original;
  });
});
