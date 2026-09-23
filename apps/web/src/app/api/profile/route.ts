import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function GET(): Promise<NextResponse> {
  return proxyAuthedRequest("/v1/profile");
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  return proxyAuthedRequest("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
