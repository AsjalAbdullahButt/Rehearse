import { NextResponse } from "next/server";

import { apiFetch, parseApiError, type TokenResponse } from "@/lib/auth/api";
import { setSessionCookies } from "@/lib/auth/cookies";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  const apiResponse = await apiFetch("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!apiResponse.ok) {
    const error = await parseApiError(apiResponse);
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  const tokens = (await apiResponse.json()) as TokenResponse;
  const response = NextResponse.json({ user: tokens.user });
  setSessionCookies(response, tokens);
  return response;
}
