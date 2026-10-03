import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const { handleSessionExpiryMock } = vi.hoisted(() => ({
  handleSessionExpiryMock: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => handleSessionExpiryMock,
}));

import { AccountPrivacyPanel } from "./account-privacy-panel";

function renderPanel() {
  return render(<AccountPrivacyPanel email="user@example.com" initialEmailVerifiedAt={null} />);
}

describe("AccountPrivacyPanel", () => {
  beforeEach(() => {
    pushMock.mockClear();
    handleSessionExpiryMock.mockClear().mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("explains that raw audio is never stored", () => {
    renderPanel();

    expect(screen.getByText(/raw audio recording is never stored/)).toBeInTheDocument();
  });

  it("submits a password change and shows a success message", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "a-new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(screen.getByText(/you'll need to sign in again/)).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error message when the password change fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Current password is incorrect." } }), {
        status: 401,
      }),
    );

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Current password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "a-new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(screen.getByText("Current password is incorrect.")).toBeInTheDocument();
    });
  });

  it("requires a confirmation step before deleting the account", () => {
    renderPanel();

    expect(screen.queryByText(/permanently deletes your account/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByText(/permanently deletes your account/)).toBeInTheDocument();
  });

  it("cancels the delete confirmation without calling the API", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/permanently deletes your account/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes the account and redirects home on success", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByPlaceholderText("Confirm your password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/account",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
