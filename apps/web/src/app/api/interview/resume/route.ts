import { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

// Must match apps/api/app/core/limits.py's MAX_RESUME_REQUEST_BYTES — the WHOLE request
// (resume file field + multipart boundary/headers), not the bare 2MB file cap alone. Comparing
// against the file cap here would reject a legitimate ~2MB PDF once its own multipart overhead
// is added on top. A cheap first pass on the declared Content-Length only — the API's own
// read-capped upload handling (bounding just the `resume` field's bytes) is what actually
// enforces the real limit against a request that omits or lies about Content-Length.
const MAX_RESUME_REQUEST_BYTES = 2 * 1024 * 1024 + 256 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESUME_REQUEST_BYTES) {
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
