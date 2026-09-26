import { cookies } from "next/headers";

import { apiFetch, type TokenResponse } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, buildSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { isTokenExpired } from "@/lib/auth/tokens";

/**
 * Read-only counterpart for Server Components (via lib/interview/server.ts). Server Components
 * cannot write cookies mid-render — Next.js throws if you try — so this never refreshes and
 * never touches `cookieStore.set`/`.delete`. It relies on the middleware (proxy.ts) having
 * already refreshed an expired-but-refreshable session before a guarded page's Server
 * Components run. If it still finds no valid token, callers treat null as unauthenticated, same
 * as before.
 */
export async function peekAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken || isTokenExpired(accessToken)) return null;
  return accessToken;
}

/**
 * Returns a valid access token for the current request, refreshing it first if the cookie is
 * missing or looks expired. Returns null when there's no session to refresh (never throws) —
 * callers turn that into a 401. Called from Route Handlers only: `cookies()` here is the
 * mutable store, so a refresh's new cookies are applied to the outgoing response the same way
 * `/api/auth/refresh` does it, just without needing to build that response itself. Server
 * Components must use `peekAccessToken` instead — see its docstring.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const response = await apiFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return null;
  }

  const tokens = (await response.json()) as TokenResponse;
  for (const cookie of buildSessionCookies(tokens)) {
    cookieStore.set(cookie.name, cookie.value, cookie.options);
  }
  return tokens.access_token;
}
