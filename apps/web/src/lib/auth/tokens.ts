export interface JwtPayload {
  sub: string;
  type: "access" | "refresh";
  exp: number;
  iat: number;
  jti: string;
}

/**
 * Decodes a JWT payload without verifying its signature. Safe to use here because the only
 * tokens this ever sees are ones the API just issued over a trusted server-to-server call —
 * this is never the security boundary. It exists purely to read `exp` for cookie maxAge and
 * for the middleware's best-effort redirect; the API's own `get_current_user` dependency
 * re-verifies the signature on every real request.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const [, payloadSegment] = token.split(".");
  if (!payloadSegment) return null;

  try {
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

const EXPIRY_SKEW_S = 10;

/**
 * Shared expiry check used by both the middleware's best-effort gate (proxy.ts) and the
 * session-refresh helper (lib/auth/session.ts), so the two never disagree about what counts as
 * "still valid" — a token that middleware treated as valid but session.ts treated as expired
 * (or vice versa) is exactly the gap that let a Server Component try to refresh mid-render.
 */
export function isTokenExpired(token: string, skewSeconds = EXPIRY_SKEW_S): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}
