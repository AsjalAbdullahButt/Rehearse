import { NextResponse } from "next/server";

import { apiErrorResponse, apiFetch, getClientIp, parseApiError } from "@/lib/auth/api";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  const apiResponse = await apiFetch(
    "/v1/auth/email-verification/confirm",
    { method: "POST", body: JSON.stringify(body) },
    { clientIp: getClientIp(request) },
  );

  if (!apiResponse.ok) {
    return apiErrorResponse(await parseApiError(apiResponse));
  }

  return new NextResponse(null, { status: 204 });
}
