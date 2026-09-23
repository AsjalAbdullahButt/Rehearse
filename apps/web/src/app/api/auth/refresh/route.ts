import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiFetch, parseApiError, type TokenResponse } from "@/lib/auth/api";
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
    const error = await parseApiError(apiResponse);
    const response = NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
    clearSessionCookies(response);
    return response;
  }

  const tokens = (await apiResponse.json()) as TokenResponse;
  const response = NextResponse.json({ user: tokens.user });
  setSessionCookies(response, tokens);
  return response;
}
