import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    API_URL: "http://api.test",
    INTERNAL_PROXY_SECRET: undefined as string | undefined,
  },
}));

import { env } from "@/lib/env";

import { apiFetch, getClientIp } from "./api";

describe("getClientIp", () => {
  it("returns the first hop of x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
    });

    expect(getClientIp(request)).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.5" } });

    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("returns null when neither header is present", () => {
    const request = new Request("http://localhost");

    expect(getClientIp(request)).toBeNull();
  });
});

function sentHeaders(): Record<string, string> {
  const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
  return Object.fromEntries(new Headers(init?.headers).entries());
}

describe("apiFetch trusted-proxy headers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.INTERNAL_PROXY_SECRET = undefined;
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("omits trusted-proxy headers when INTERNAL_PROXY_SECRET is unset", async () => {
    await apiFetch("/v1/whatever", undefined, { clientIp: "198.51.100.7" });

    expect(sentHeaders()).not.toHaveProperty("x-internal-proxy-secret");
  });

  it("omits trusted-proxy headers when no clientIp is given, even with a secret configured", async () => {
    env.INTERNAL_PROXY_SECRET = "a-strong-shared-secret-value-1234567890";

    await apiFetch("/v1/whatever");

    expect(sentHeaders()).not.toHaveProperty("x-internal-proxy-secret");
  });

  it("attaches the secret and forwarded IP when both are present", async () => {
    env.INTERNAL_PROXY_SECRET = "a-strong-shared-secret-value-1234567890";

    await apiFetch("/v1/whatever", undefined, { clientIp: "198.51.100.7" });

    expect(sentHeaders()).toMatchObject({
      "x-internal-proxy-secret": "a-strong-shared-secret-value-1234567890",
      "x-internal-client-ip": "198.51.100.7",
    });
  });
});
