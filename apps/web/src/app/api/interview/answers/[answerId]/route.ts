import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/interview/proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ answerId: string }> },
): Promise<NextResponse> {
  const { answerId } = await params;
  return proxyAuthedRequest(`/v1/answers/${encodeURIComponent(answerId)}`);
}
