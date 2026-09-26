import { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

// Must match apps/api/app/routers/answers.py's MAX_IDEMPOTENCY_KEY_LENGTH — rejecting an
// oversized key here saves a round trip to the API for a request that would be rejected there
// anyway.
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export async function POST(request: Request): Promise<NextResponse> {
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey !== null && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_idempotency_key",
          message: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
        },
      },
      { status: 400 },
    );
  }

  // Forwarded as-is: the browser's multipart FormData (session_id/question_id/time_cap_s
  // fields + the audio Blob) becomes the API's multipart body unchanged, boundary included.
  const formData = await request.formData();

  return proxyAuthedRequest("/v1/answers", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: formData,
  });
}
