import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ answerId: string }> },
): Promise<NextResponse> {
  const { answerId } = await params;
  return proxyAuthedRequest(`/v1/reports/${encodeURIComponent(answerId)}/shares`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ answerId: string }> },
): Promise<NextResponse> {
  const { answerId } = await params;
  const body: unknown = await request.json().catch(() => null);
  return proxyAuthedRequest(`/v1/reports/${encodeURIComponent(answerId)}/share`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
