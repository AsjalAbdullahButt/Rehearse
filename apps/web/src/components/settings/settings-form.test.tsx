import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn().mockResolvedValue(false),
}));

import type { Profile } from "@/lib/interview/types";

import { SettingsForm } from "./settings-form";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    display_name: null,
    target_role: null,
    answer_cap_s: 120,
    voice_name: null,
    voice_rate: 1,
    ...overrides,
  };
}

function lastRequestBody(): Record<string, unknown> {
  const [, init] = vi.mocked(fetch).mock.calls[0]!;
  return JSON.parse(init!.body as string) as Record<string, unknown>;
}

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("has no target role selected by default", () => {
    render(<SettingsForm initialProfile={profile()} />);

    expect(screen.getByRole("button", { name: "No default" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pre-selects the saved target role", () => {
    render(<SettingsForm initialProfile={profile({ target_role: "backend" })} />);

    expect(screen.getByRole("button", { name: "Backend" })).toHaveAttribute("aria-pressed", "true");
  });

  it("saves the selected target role", async () => {
    render(<SettingsForm initialProfile={profile()} />);

    fireEvent.click(screen.getByRole("button", { name: "Frontend" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ target_role: "frontend" });
  });

  it("saves null when the target role is cleared back to No default", async () => {
    render(<SettingsForm initialProfile={profile({ target_role: "backend" })} />);

    fireEvent.click(screen.getByRole("button", { name: "No default" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ target_role: null });
  });
});
