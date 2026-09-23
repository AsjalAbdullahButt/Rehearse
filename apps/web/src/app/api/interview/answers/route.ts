import type { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/auth/proxy";

export async function POST(request: Request): Promise<NextResponse> {
  // Forwarded as-is: the browser's multipart FormData (session_id/question_id/time_cap_s
  // fields + the audio Blob) becomes the API's multipart body unchanged, boundary included.
  const formData = await request.formData();

  return proxyAuthedRequest("/v1/answers", {
    method: "POST",
    body: formData,
  });
}
