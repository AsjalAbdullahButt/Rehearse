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

  it("returns null instead of throwing when the access token is expired but a refresh token exists", async () => {
    cookieStore.get.mockImplementation((name) => {
      if (name === ACCESS_TOKEN_COOKIE) return { value: makeJwt(-60) };
      if (name === REFRESH_TOKEN_COOKIE) return { value: makeJwt(1000, "refresh") };
      return undefined;
    });

    await expect(peekAccessToken()).resolves.toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("returns null without touching cookies when there is no access token at all", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(peekAccessToken()).resolves.toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
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
});
