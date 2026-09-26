// @vitest-environment node
//
// jsdom's FormData/Blob/Request implementations don't interoperate (constructing a Request
// with a jsdom FormData body throws) — this route only ever runs server-side anyway, so the
// Node environment (real undici Request/FormData) is both correct and necessary here.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/proxy", () => ({
  proxyAuthedRequest: vi.fn(),
}));

import { proxyAuthedRequest } from "@/lib/auth/proxy";

import { POST } from "./route";

function requestWith(headers: HeadersInit): Request {
  const formData = new FormData();
  formData.set("session_id", "s1");
  formData.set("question_id", "q1");
  formData.set("time_cap_s", "120");
  formData.set("audio", new Blob(["fake-audio"], { type: "audio/webm" }), "answer.webm");
  return new Request("http://localhost/api/interview/answers", {
    method: "POST",
    headers,
    body: formData,
  });
}

describe("POST /api/interview/answers", () => {
  beforeEach(() => {
    vi.mocked(proxyAuthedRequest)
      .mockReset()
      .mockResolvedValue(new Response(null, { status: 201 }) as never);
  });

  it("forwards the Idempotency-Key header to the API", async () => {
    await POST(requestWith({ "Idempotency-Key": "retry-key-1" }));

    expect(proxyAuthedRequest).toHaveBeenCalledWith(
      "/v1/answers",
      expect.objectContaining({ headers: { "Idempotency-Key": "retry-key-1" } }),
    );
  });

  it("omits the header entirely when the browser didn't send one", async () => {
    await POST(requestWith({}));

    expect(proxyAuthedRequest).toHaveBeenCalledWith(
      "/v1/answers",
      expect.objectContaining({ headers: undefined }),
    );
  });

  it("rejects an oversized key with 400 before ever calling the API", async () => {
    const response = await POST(requestWith({ "Idempotency-Key": "x".repeat(129) }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_idempotency_key");
    expect(proxyAuthedRequest).not.toHaveBeenCalled();
  });

  it("accepts a key exactly at the length limit", async () => {
    const response = await POST(requestWith({ "Idempotency-Key": "x".repeat(128) }));

    expect(response.status).toBe(201);
    expect(proxyAuthedRequest).toHaveBeenCalled();
  });
});
