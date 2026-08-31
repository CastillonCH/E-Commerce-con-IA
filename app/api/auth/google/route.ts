import { NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const CSRF_COOKIE = "google_oauth_csrf";

/**
 * Inicia el flujo OAuth 2.0 "Authorization Code" con Google (implementado a
 * mano, sin librería, para no depender de que un paquete de auth de terceros
 * ya soporte Next.js 16). Requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en
 * el entorno — se obtienen creando un "OAuth 2.0 Client ID" en Google Cloud
 * Console y registrando `<tu-dominio>/api/auth/google/callback` como
 * Authorized redirect URI. Sin esas variables, este endpoint redirige de
 * vuelta al login con un mensaje de error en vez de romper.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "/";
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const csrf = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ csrf, from })).toString(
    "base64url"
  );

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set(
    "redirect_uri",
    `${url.origin}/api/auth/google/callback`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
