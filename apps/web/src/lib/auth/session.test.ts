import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = {
  get: vi.fn<(name: string) => { value: string } | undefined>(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/api")>("@/lib/auth/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "@/lib/auth/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { makeJwt } from "@/lib/auth/test-fixtures";

import { getValidAccessToken, peekAccessToken } from "./session";

function throwOnMutation(): never {
  // Mirrors what Next.js actually throws when cookies() is mutated during a Server Component
  // render (outside a Server Action/Route Handler) — the exact bug item 1 fixes.
  throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
}

describe("peekAccessToken (Server Component read path)", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset().mockImplementation(throwOnMutation);
    cookieStore.delete.mockReset().mockImplementation(throwOnMutation);
    vi.mocked(apiFetch).mockReset();
  });

  it("returns the token when it is still valid, without touching cookies", async () => {
    const token = makeJwt(600);
    cookieStore.get.mockImplementation((name) =>
      name === ACCESS_TOKEN_COOKIE ? { value: token } : undefined,
    );

    await expect(peekAccessToken()).resolves.toBe(token);
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("refreshes and returns the new access token when the cookie is expired, without touching cookies", async () => {
    // Regression test for a real bug: this used to give up and return null the instant it saw
    // an expired access-token cookie, trusting the middleware to have already refreshed it —
    // which isn't a safe assumption, and produced a spurious "session expired" sign-out on any
    // guarded navigation whose access token had simply aged out (unavoidable on a multi-question
    // interview session running longer than JWT_ACCESS_TTL_MIN), even with a perfectly valid
    // refresh token in hand.
    const newAccess = makeJwt(900);
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: newAccess,
          refresh_token: makeJwt(30 * 24 * 60 * 60, "refresh"),
          token_type: "bearer",
          user: { id: "user-1", email: "a@b.com" },
        }),
        { status: 200 },
      ),
    );
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    await expect(peekAccessToken()).resolves.toBe(newAccess);
    // The refreshed pair is used for this render's own API calls but never persisted as
    // cookies — Server Components can't write cookies mid-render; the middleware does that
    // real persistence on the next request.
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("returns null when the access token is expired and the refresh call itself fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 401 }));
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    await expect(peekAccessToken()).resolves.toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("returns null without ever calling apiFetch when there is no refresh token either", async () => {
    cookieStore.get.mockImplementation((name) =>
      name === ACCESS_TOKEN_COOKIE ? { value: makeJwt(-60) } : undefined,
    );

    await expect(peekAccessToken()).resolves.toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("returns null without touching cookies when there is no access token at all", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(peekAccessToken()).resolves.toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("de-dupes a concurrent refresh with getValidAccessToken callers racing the same token", async () => {
    const newAccess = makeJwt(900);
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: newAccess,
          refresh_token: makeJwt(30 * 24 * 60 * 60, "refresh"),
          token_type: "bearer",
          user: { id: "user-1", email: "a@b.com" },
        }),
        { status: 200 },
      ),
    );
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    const [first, second] = await Promise.all([peekAccessToken(), peekAccessToken()]);

    expect(first).toBe(newAccess);
    expect(second).toBe(newAccess);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getValidAccessToken (Route Handler refresh path)", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
    vi.mocked(apiFetch).mockReset();
  });

  it("refreshes and persists new cookies when the access token is expired", async () => {
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
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    await expect(getValidAccessToken()).resolves.toBe(newAccess);
    expect(cookieStore.set).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, newAccess, expect.anything());
  });

  it("de-dupes concurrent refreshes against the same rotating refresh token into a single call", async () => {
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
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    const [first, second] = await Promise.all([getValidAccessToken(), getValidAccessToken()]);

    expect(first).toBe(newAccess);
    expect(second).toBe(newAccess);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
