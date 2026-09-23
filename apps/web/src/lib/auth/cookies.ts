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

export function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: maxAgeFromExp(tokens.access_token, FALLBACK_ACCESS_TTL_S),
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: maxAgeFromExp(tokens.refresh_token, FALLBACK_REFRESH_TTL_S),
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
}
