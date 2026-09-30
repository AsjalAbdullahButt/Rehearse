import type { NextResponse } from "next/server";

import { clearSessionCookies } from "@/lib/auth/cookies";
import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  const response = await proxyAuthedRequest("/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (response.status === 204) clearSessionCookies(response);
  return response;
}
