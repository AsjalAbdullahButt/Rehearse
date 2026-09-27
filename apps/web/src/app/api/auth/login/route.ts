import { NextResponse } from "next/server";

import {
  apiErrorResponse,
  apiFetch,
  getClientIp,
  parseApiError,
  type TokenResponse,
} from "@/lib/auth/api";
import { setSessionCookies } from "@/lib/auth/cookies";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  const apiResponse = await apiFetch(
    "/v1/auth/login",
    { method: "POST", body: JSON.stringify(body) },
    { clientIp: getClientIp(request) },
  );

  if (!apiResponse.ok) {
    return apiErrorResponse(await parseApiError(apiResponse));
  }

  const tokens = (await apiResponse.json()) as TokenResponse;
  const response = NextResponse.json({ user: tokens.user });
  setSessionCookies(response, tokens);
  return response;
}
