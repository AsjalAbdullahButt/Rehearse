import { cookies } from "next/headers";

import { apiFetch, type TokenResponse } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, buildSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { decodeJwtPayload } from "@/lib/auth/tokens";

const EXPIRY_SKEW_S = 10;

function isExpiredOrMalformed(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp * 1000 <= Date.now() + EXPIRY_SKEW_S * 1000;
}

/**
 * Returns a valid access token for the current request, refreshing it first if the cookie is
 * missing or looks expired. Returns null when there's no session to refresh (never throws) —
 * callers turn that into a 401. Called from Route Handlers only: `cookies()` here is the
 * mutable store, so a refresh's new cookies are applied to the outgoing response the same way
 * `/api/auth/refresh` does it, just without needing to build that response itself.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken && !isExpiredOrMalformed(accessToken)) {
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
