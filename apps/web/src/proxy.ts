import { NextResponse, type NextRequest } from "next/server";

import { apiFetch, type TokenResponse } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, buildSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { isTokenExpired } from "@/lib/auth/tokens";

const APP_PREFIXES = ["/interview", "/report", "/progress", "/mastery", "/settings"];
const isDev = process.env.NODE_ENV === "development";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' only lets WebAssembly modules compile (the optional camera coach's
    // on-device face model); it does not enable eval() of JavaScript. `style-src` still permits
    // inline styles because React/Motion write dynamic style attributes throughout the UI.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// There's no built-in way for a Server Component to read the current request's pathname:
// carrying it forward as a header is the standard workaround. The same request headers also
// carry the nonce/CSP so Next can apply the nonce to framework-managed inline scripts.
function requestHeaders(
  request: NextRequest,
  {
    includePathname,
  }: {
    includePathname: boolean;
  },
): { csp: string; headers: Headers } {
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  if (includePathname) {
    headers.set("x-pathname", request.nextUrl.pathname);
  }
  return { csp, headers };
}

function redirectToSignIn(request: NextRequest, csp: string): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/sign-in";
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);
  return withCsp(NextResponse.redirect(redirectUrl), csp);
}

// A best-effort gate, not the security boundary: it never verifies the access token's
// signature (Edge middleware has no reason to hold the JWT secret), so it can't be spoofed into
// granting real access. Every API call still goes through get_current_user, which does verify.
// It exists to avoid flashing a guarded page, and to refresh cookies before Server Components
// render when an otherwise-valid session has an expired access token.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isAppRoute = APP_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  const { csp, headers } = requestHeaders(request, { includePathname: isAppRoute });

  if (!isAppRoute) {
    return withCsp(NextResponse.next({ request: { headers } }), csp);
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken && !isTokenExpired(accessToken)) {
    return withCsp(NextResponse.next({ request: { headers } }), csp);
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return redirectToSignIn(request, csp);
  }

  const refreshResponse = await apiFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => null);

  if (!refreshResponse || !refreshResponse.ok) {
    return redirectToSignIn(request, csp);
  }

  const tokens = (await refreshResponse.json()) as TokenResponse;
  for (const cookie of buildSessionCookies(tokens)) {
    request.cookies.set(cookie.name, cookie.value);
  }
  const response = withCsp(NextResponse.next({ request: { headers } }), csp);
  for (const cookie of buildSessionCookies(tokens)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif)$).*)"],
};
