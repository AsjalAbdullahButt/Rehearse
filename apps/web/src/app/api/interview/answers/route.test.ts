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
      expect.objectContaining({ clientIp: null }),
    );
  });

  it("omits the header entirely when the browser didn't send one", async () => {
    await POST(requestWith({}));

    expect(proxyAuthedRequest).toHaveBeenCalledWith(
      "/v1/answers",
      expect.objectContaining({ headers: undefined }),
      expect.anything(),
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

  it("forwards the real client IP from x-forwarded-for", async () => {
    await POST(requestWith({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }));

    expect(proxyAuthedRequest).toHaveBeenCalledWith("/v1/answers", expect.anything(), {
      clientIp: "198.51.100.7",
    });
  });

  it("rejects a declared oversized body with 413 before calling formData or the API", async () => {
    const request = requestWith({ "content-length": String(6 * 1024 * 1024) });
    const response = await POST(request);

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("payload_too_large");
    expect(proxyAuthedRequest).not.toHaveBeenCalled();
  });

  it("rejects a request between the old 5MB cap and Vercel's ~4.5MB hard limit", async () => {
    // This project must never accept a body this large on Vercel — a request this size would
    // be rejected by the platform itself before this function even ran. The old constant
    // (4MB audio + 1MB overhead = 5MB) would have let this through the BFF's own check; the
    // corrected constant (~4.25MB) catches it here instead.
    const request = requestWith({ "content-length": String(4.6 * 1024 * 1024) });
    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(proxyAuthedRequest).not.toHaveBeenCalled();
  });

  it("allows a declared length just under the corrected ~4.25MB cap", async () => {
    const request = requestWith({ "content-length": String(4 * 1024 * 1024 + 100 * 1024) });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(proxyAuthedRequest).toHaveBeenCalled();
  });
});
