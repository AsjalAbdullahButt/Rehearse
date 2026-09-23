import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/auth/api";
import { clearSessionCookies, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    await apiFetch("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => null);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
