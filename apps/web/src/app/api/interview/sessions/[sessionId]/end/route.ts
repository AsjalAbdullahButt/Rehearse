import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params;
  return proxyAuthedRequest(`/v1/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: "POST",
  });
}
