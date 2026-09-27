// @vitest-environment node
//
// jsdom's FormData/Blob/Request implementations don't interoperate (constructing a Request with
// a jsdom FormData body throws) — this route only ever runs server-side anyway, so the Node
// environment (real undici Request/FormData) is both correct and necessary here.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/proxy", () => ({
  proxyAuthedRequest: vi.fn(),
}));

import { proxyAuthedRequest } from "@/lib/auth/proxy";

import { POST } from "./route";

function requestWith(headers: HeadersInit): Request {
  const formData = new FormData();
  formData.set("resume", new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), "resume.pdf");
  return new Request("http://localhost/api/interview/resume", {
    method: "POST",
    headers,
    body: formData,
  });
}

describe("POST /api/interview/resume", () => {
  beforeEach(() => {
    vi.mocked(proxyAuthedRequest)
      .mockReset()
      .mockResolvedValue(new Response(null, { status: 200 }) as never);
  });

  it("forwards the multipart form data to the API", async () => {
    await POST(requestWith({}));

    expect(proxyAuthedRequest).toHaveBeenCalledWith(
      "/v1/resume/parse",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a declared oversized body with 413 before calling formData or the API", async () => {
    const request = requestWith({ "content-length": String(3 * 1024 * 1024) });
    const response = await POST(request);

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("payload_too_large");
    expect(proxyAuthedRequest).not.toHaveBeenCalled();
  });

  it("allows a declared length at the limit", async () => {
    const request = requestWith({ "content-length": String(2 * 1024 * 1024) });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(proxyAuthedRequest).toHaveBeenCalled();
  });
});
