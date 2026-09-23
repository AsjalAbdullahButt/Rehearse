import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/interview/proxy";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  return proxyAuthedRequest("/v1/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
