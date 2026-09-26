import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Mirrors Next's real redirect(), which aborts rendering by throwing — a mock that just
    // returned would let AppLayout's body keep running past the `if (!user)` guard and crash
    // on `user.email` below it.
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/interview/server", () => ({
  fetchCurrentUser: vi.fn(async () => null),
}));

import AppLayout from "./layout";

describe("AppLayout redirect (unauthenticated)", () => {
  beforeEach(() => {
    headersMock.mockReset();
  });

  it("carries the current path as ?next= when proxy.ts's x-pathname header is present", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-pathname": "/progress" }));

    await expect(AppLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fprogress",
    );
  });

  it("falls back to a bare /sign-in when the header is missing", async () => {
    headersMock.mockResolvedValue(new Headers());

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/sign-in");
  });
});
