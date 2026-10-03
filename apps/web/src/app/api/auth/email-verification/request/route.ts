import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function POST(): Promise<NextResponse> {
  return proxyAuthedRequest("/v1/auth/email-verification/request", { method: "POST" });
}
