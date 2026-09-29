import { cookies } from "next/headers";

import { apiFetch, type TokenResponse } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, buildSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { isTokenExpired } from "@/lib/auth/tokens";

// Module-scoped, keyed by the refresh token being redeemed: concurrent callers racing the same
// rotating refresh token would otherwise each fire their own /v1/auth/refresh, and only one of
// those calls can win against a token that gets invalidated on rotation — the rest would fail
// and log a valid session out. Every concurrent caller instead awaits the same in-flight
// request and applies its result to their own cookie store.
let inFlightRefresh: { refreshToken: string; promise: Promise<TokenResponse | null> } | null = null;

async function refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
  if (inFlightRefresh && inFlightRefresh.refreshToken === refreshToken) {
    return inFlightRefresh.promise;
  }

  const promise = (async () => {
    const response = await apiFetch("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return null;
    return (await response.json()) as TokenResponse;
  })();

  inFlightRefresh = { refreshToken, promise };
  try {
    return await promise;
  } finally {
    if (inFlightRefresh?.promise === promise) {
      inFlightRefresh = null;
    }
  }
}

/**
 * Read-only counterpart for Server Components (via lib/interview/server.ts). Server Components
 * cannot write cookies mid-render — Next.js throws if you try — so this never calls
 * `cookieStore.set`/`.delete`, unlike getValidAccessToken below.
 *
 * It used to stop at "the access-token cookie looks expired, return null" — relying entirely on
 * the middleware (proxy.ts) having already refreshed an expired-but-refreshable session before a
 * guarded page's Server Components run. That's not a safe assumption to build the *real*
 * authorization check on: the middleware is documented as "a best-effort gate, not the security
 * boundary" specifically so a request that slipped past it in any way still lands somewhere
 * correct — but a Server Component that gives up the instant it sees an expired cookie, without
 * even trying to refresh, defeats that whole purpose. This was a real, confirmed bug: it read as
 * "session expired, please sign in again" on every single guarded navigation whose access token
 * happened to have aged out since the last one (unavoidable for any multi-question interview
 * session that runs longer than JWT_ACCESS_TTL_MIN), even though the refresh token was still
 * perfectly valid.
 *
 * Now it falls back to the same shared, de-duplicated `refreshTokens` call getValidAccessToken
 * uses, and returns the freshly-minted access token for *this render's* API calls — it just
 * never persists that pair as cookies (can't, from here). The middleware still does that real
 * persistence on the next request; at worst this costs one extra refresh call in the case where
 * the middleware's own refresh didn't (for whatever reason) reach this render, instead of a
 * spurious sign-out.
 */
export async function peekAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const tokens = await refreshTokens(refreshToken);
  return tokens?.access_token ?? null;
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

  const tokens = await refreshTokens(refreshToken);
  if (!tokens) {
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return null;
  }

  for (const cookie of buildSessionCookies(tokens)) {
    cookieStore.set(cookie.name, cookie.value, cookie.options);
  }
  return tokens.access_token;
}
