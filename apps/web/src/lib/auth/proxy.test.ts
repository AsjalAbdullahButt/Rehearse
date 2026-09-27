import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/api")>("@/lib/auth/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/auth/api";
import { getValidAccessToken } from "@/lib/auth/session";

import { proxyAuthedRequest } from "./proxy";

describe("proxyAuthedRequest", () => {
  beforeEach(() => {
    vi.mocked(getValidAccessToken).mockReset().mockResolvedValue("valid-token");
    vi.mocked(apiFetch).mockReset();
  });

  it("passes through a normal JSON response unchanged", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await proxyAuthedRequest("/v1/whatever");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns a structured error instead of throwing when a 200 response has an invalid body", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("not json", { status: 200 }));

    const response = await proxyAuthedRequest("/v1/whatever");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("upstream_invalid_response");
  });

  it("returns a structured error when a 200 response has an empty body", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("", { status: 200 }));

    const response = await proxyAuthedRequest("/v1/whatever");

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("upstream_invalid_response");
  });

  it("returns 401 without calling apiFetch when there is no valid access token", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const response = await proxyAuthedRequest("/v1/whatever");

    expect(response.status).toBe(401);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("forwards the clientIp option through to apiFetch", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await proxyAuthedRequest("/v1/whatever", undefined, { clientIp: "198.51.100.7" });

    expect(apiFetch).toHaveBeenCalledWith("/v1/whatever", expect.anything(), {
      clientIp: "198.51.100.7",
    });
  });
});
