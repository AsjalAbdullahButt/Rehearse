import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiErrorResponse, apiFetch, parseApiError, type TokenResponse } from "@/lib/auth/api";
import { clearSessionCookies, REFRESH_TOKEN_COOKIE, setSessionCookies } from "@/lib/auth/cookies";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "No active session." } },
      { status: 401 },
    );
  }

  const apiResponse = await apiFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!apiResponse.ok) {
    const response = apiErrorResponse(await parseApiError(apiResponse));
    clearSessionCookies(response);
    return response;
  }

  const tokens = (await apiResponse.json()) as TokenResponse;
  const response = NextResponse.json({ user: tokens.user });
  setSessionCookies(response, tokens);
  return response;
}
