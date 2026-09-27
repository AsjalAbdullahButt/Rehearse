import { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

// Must match apps/api/app/core/limits.py's MAX_RESUME_BYTES. A cheap first pass on the declared
// Content-Length only — the API's own read-capped upload handling is what actually enforces this
// against a request that omits or lies about Content-Length.
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESUME_BYTES) {
    return NextResponse.json(
      { error: { code: "payload_too_large", message: "Resume file is too large." } },
      { status: 413 },
    );
  }

  // Forwarded as-is: the browser's multipart FormData (the resume File) becomes the API's
  // multipart body unchanged, boundary included — same pattern as interview/answers/route.ts.
  const formData = await request.formData();

  return proxyAuthedRequest("/v1/resume/parse", { method: "POST", body: formData });
}
