import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useSearchParams: () => new URLSearchParams(),
}));

import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the password requirements hint only in Create account mode", () => {
    render(<SignInForm />);

    expect(screen.queryByText(/At least 15 characters/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));

    expect(screen.getByText(/At least 15 characters/)).toBeInTheDocument();
  });

  it("does not impose a client-side minimum length on the Sign in password field", () => {
    render(<SignInForm />);

    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.minLength).toBe(-1); // no minLength attribute set
  });

  it("clears a stale error message when switching modes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "password: too short" } }), {
        status: 422,
      }),
    );

    render(<SignInForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.submit(screen.getByRole("tabpanel"));

    await screen.findByText("password: too short");

    fireEvent.click(screen.getByRole("tab", { name: "Sign in" }));

    expect(screen.queryByText("password: too short")).not.toBeInTheDocument();
  });
});
