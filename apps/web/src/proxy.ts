import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { decodeJwtPayload } from "@/lib/auth/tokens";

const APP_PREFIXES = ["/interview", "/report", "/progress", "/settings"];

export function proxy(request: NextRequest): NextResponse {
  const isAppRoute = APP_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isAppRoute) {
    return NextResponse.next();
  }

  // A best-effort gate, not the security boundary: it only checks that a well-formed,
  // unexpired access token cookie is present. It never verifies the signature (Edge
  // middleware has no reason to hold the JWT secret), so it can't be spoofed into granting
  // real access — every API call still goes through get_current_user, which does verify.
  // This just avoids flashing a guarded page at someone with no session before redirecting.
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = accessToken ? decodeJwtPayload(accessToken) : null;
  const hasLikelyValidSession = payload !== null && payload.exp * 1000 > Date.now();

  if (!hasLikelyValidSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif)$).*)"],
};
