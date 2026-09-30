import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    assignMock.mockClear();
    // A plain `router.push()` mock can't catch the real bug here (see sign-in-form.tsx's
    // comment) — it never races Next's client router the way a real browser does. Stubbing
    // `window.location.assign` lets the test assert on the actual hard-navigation call the
    // component makes instead.
    Object.defineProperty(window, "location", {
      value: { assign: assignMock },
      writable: true,
    });
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

  it("hard-navigates to the next path on a successful login", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ user: {} }), { status: 200 }));

    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-real-password" } });
    fireEvent.submit(screen.getByRole("tabpanel"));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith("/interview"));
  });
});
