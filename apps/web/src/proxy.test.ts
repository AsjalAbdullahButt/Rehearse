import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/api")>("@/lib/auth/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { makeJwt } from "@/lib/auth/test-fixtures";

import { proxy } from "./proxy";

function requestFor(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe("proxy middleware", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("ignores routes outside the guarded app prefixes", async () => {
    const response = await proxy(requestFor("/sign-in"));
    expect(response.headers.get("location")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("passes through when the access token is still valid", async () => {
    const response = await proxy(requestFor("/interview", { [ACCESS_TOKEN_COOKIE]: makeJwt(600) }));
    expect(response.headers.get("location")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("redirects to sign-in, preserving the target path, when there is no session at all", async () => {
    const response = await proxy(requestFor("/progress"));
    expect(response.headers.get("location")).toContain("/sign-in");
    expect(response.headers.get("location")).toContain("next=%2Fprogress");
  });

  it("refreshes an expired-but-refreshable session and lets the request through with new cookies, instead of redirecting", async () => {
    const newAccess = makeJwt(900);
    const newRefresh = makeJwt(30 * 24 * 60 * 60, "refresh");
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: newAccess,
          refresh_token: newRefresh,
          token_type: "bearer",
          user: { id: "user-1", email: "a@b.com" },
        }),
        { status: 200 },
      ),
    );

    const response = await proxy(
      requestFor("/report/abc", {
        [ACCESS_TOKEN_COOKIE]: makeJwt(-60),
        [REFRESH_TOKEN_COOKIE]: makeJwt(1000, "refresh"),
      }),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBe(newAccess);
    expect(response.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe(newRefresh);
  });

  it("redirects to sign-in when the refresh token is invalid or the refresh call fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 401 }));

    const response = await proxy(
      requestFor("/settings", {
        [ACCESS_TOKEN_COOKIE]: makeJwt(-60),
        [REFRESH_TOKEN_COOKIE]: makeJwt(1000, "refresh"),
      }),
    );

    expect(response.headers.get("location")).toContain("/sign-in");
  });
});
