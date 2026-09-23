import type { NextResponse } from "next/server";

import { decodeJwtPayload } from "@/lib/auth/tokens";

export const ACCESS_TOKEN_COOKIE = "rehearse_access_token";
export const REFRESH_TOKEN_COOKIE = "rehearse_refresh_token";

const FALLBACK_ACCESS_TTL_S = 15 * 60;
const FALLBACK_REFRESH_TTL_S = 30 * 24 * 60 * 60;

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function maxAgeFromExp(token: string, fallbackSeconds: number): number {
  const payload = decodeJwtPayload(token);
  if (!payload) return fallbackSeconds;

  const secondsRemaining = payload.exp - Math.floor(Date.now() / 1000);
  return secondsRemaining > 0 ? secondsRemaining : fallbackSeconds;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface SessionCookie {
  name: string;
  value: string;
  options: typeof BASE_COOKIE_OPTIONS & { maxAge: number };
}

/** Pure: computes the two session cookies for a token pair. Kept separate from any single
 * cookie jar so both a NextResponse (register/login/refresh/logout routes) and the mutable
 * `cookies()` store (the session-refresh helper used by authenticated proxy routes) can apply
 * the same values without duplicating the maxAge-from-exp logic. */
export function buildSessionCookies(tokens: TokenPair): [SessionCookie, SessionCookie] {
  return [
    {
      name: ACCESS_TOKEN_COOKIE,
      value: tokens.access_token,
      options: {
        ...BASE_COOKIE_OPTIONS,
        maxAge: maxAgeFromExp(tokens.access_token, FALLBACK_ACCESS_TTL_S),
      },
    },
    {
      name: REFRESH_TOKEN_COOKIE,
      value: tokens.refresh_token,
      options: {
        ...BASE_COOKIE_OPTIONS,
        maxAge: maxAgeFromExp(tokens.refresh_token, FALLBACK_REFRESH_TTL_S),
      },
    },
  ];
}

export function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  for (const cookie of buildSessionCookies(tokens)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
}
