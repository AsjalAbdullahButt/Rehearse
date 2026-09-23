import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ answerId: string }> },
): Promise<NextResponse> {
  const { answerId } = await params;
  return proxyAuthedRequest(`/v1/answers/${encodeURIComponent(answerId)}`);
}
