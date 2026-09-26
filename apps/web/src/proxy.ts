import { NextResponse, type NextRequest } from "next/server";

import { apiFetch, type TokenResponse } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, buildSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { isTokenExpired } from "@/lib/auth/tokens";

const APP_PREFIXES = ["/interview", "/report", "/progress", "/settings"];

function redirectToSignIn(request: NextRequest): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/sign-in";
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

// A best-effort gate, not the security boundary: it never verifies the access token's
// signature (Edge middleware has no reason to hold the JWT secret), so it can't be spoofed into
// granting real access — every API call still goes through get_current_user, which does verify.
// It exists to avoid flashing a guarded page (or, worse, letting a Server Component try to
// refresh cookies mid-render — Next.js throws when that happens outside a Route Handler/Server
// Action) at a request with an expired-but-refreshable or missing session.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isAppRoute = APP_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isAppRoute) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken && !isTokenExpired(accessToken)) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return redirectToSignIn(request);
  }

  const refreshResponse = await apiFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => null);

  if (!refreshResponse || !refreshResponse.ok) {
    return redirectToSignIn(request);
  }

  const tokens = (await refreshResponse.json()) as TokenResponse;
  for (const cookie of buildSessionCookies(tokens)) {
    request.cookies.set(cookie.name, cookie.value);
  }
  const response = NextResponse.next({ request });
  for (const cookie of buildSessionCookies(tokens)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif)$).*)"],
};
