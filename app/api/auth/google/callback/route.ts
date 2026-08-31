import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/lib/auth";
import { CSRF_COOKIE } from "@/app/api/auth/google/route";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleProfile {
  email: string;
  name: string;
}

function redirectWithError(origin: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "google_failed");
  return NextResponse.redirect(loginUrl);
}

/** Intercambia el `code` por tokens y arma la sesión. Ver TODOs en /api/auth/google/route.ts. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWithError(url.origin);

  let from = "/";
  let csrf = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    from = typeof decoded.from === "string" ? decoded.from : "/";
    csrf = typeof decoded.csrf === "string" ? decoded.csrf : "";
  } catch {
    return redirectWithError(url.origin);
  }

  const store = await cookies();
  const expectedCsrf = store.get(CSRF_COOKIE)?.value;
  if (!csrf || !expectedCsrf || csrf !== expectedCsrf) {
    return redirectWithError(url.origin);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectWithError(url.origin);

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return redirectWithError(url.origin);
  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  const profileResponse = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileResponse.ok) return redirectWithError(url.origin);
  const profile = (await profileResponse.json()) as GoogleProfile;

  const response = NextResponse.redirect(new URL(from, url.origin));
  response.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      role: "CLIENT",
      name: profile.name,
      email: profile.email,
      provider: "google",
    }),
    sessionCookieOptions()
  );
  response.cookies.delete(CSRF_COOKIE);
  return response;
}
