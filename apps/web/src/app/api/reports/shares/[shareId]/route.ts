import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
): Promise<NextResponse> {
  const { shareId } = await params;
  return proxyAuthedRequest(`/v1/reports/shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
  });
}
