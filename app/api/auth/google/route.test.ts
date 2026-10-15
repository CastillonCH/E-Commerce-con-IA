import { describe, expect, it } from "vitest";
import { GET } from "./route";

function getRequest(url: string) {
  return new Request(url);
}

describe("GET /api/auth/google", () => {
  it("redirige a /login?error=google_not_configured si faltan las credenciales", async () => {
    const original = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    const response = await GET(getRequest("http://localhost/api/auth/google"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("error=google_not_configured");

    process.env.GOOGLE_CLIENT_ID = original;
  });

  it("redirige a Google con un state firmado y una cookie CSRF cuando sí hay credenciales", async () => {
    const original = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const response = await GET(
      getRequest("http://localhost/api/auth/google?from=%2Fcheckout"),
    );
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("client_id=test-client-id");
    expect(response.cookies.get("google_oauth_csrf")?.value).toBeTruthy();

    process.env.GOOGLE_CLIENT_ID = original;
  });

  it("neutraliza un `from` que apunta a un sitio externo (open redirect)", async () => {
    const original = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const response = await GET(
      getRequest(
        "http://localhost/api/auth/google?from=https://evil.com",
      ),
    );
    const location = response.headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    expect(decoded.from).toBe("/");

    process.env.GOOGLE_CLIENT_ID = original;
  });
});
