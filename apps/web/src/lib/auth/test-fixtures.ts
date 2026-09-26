// Shared test fixture for constructing fake JWTs across auth-related test files. Not matched by
// vitest's `*.test.ts` include pattern, so it isn't itself run as a test suite.
function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/** Builds an unsigned JWT with `exp` `expSecondsFromNow` seconds from now (negative = already
 * expired). The signature segment is a dummy — nothing in this codebase verifies it client-side;
 * see tokens.ts's decodeJwtPayload docstring. */
export function makeJwt(expSecondsFromNow: number, type: "access" | "refresh" = "access"): string {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const nowS = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub: "user-1",
      type,
      exp: nowS + expSecondsFromNow,
      iat: nowS,
      jti: "test-jti",
    }),
  );
  return `${header}.${payload}.dummy-signature`;
}
