import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn().mockResolvedValue(false),
}));

import { ToastProvider } from "@/components/ui/toast";
import type { Profile } from "@/lib/interview/types";

import { SettingsForm } from "./settings-form";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    display_name: null,
    target_role: null,
    answer_cap_s: 120,
    voice_name: null,
    voice_rate: 1,
    candidate_background: null,
    skills: null,
    years_experience: null,
    ...overrides,
  };
}

// ResumeUpload (rendered inside SettingsForm's new "Resume & background" section) needs a
// ToastProvider ancestor — mirrors resume-upload.test.tsx's own render helper.
function renderSettings(initialProfile: Profile) {
  return render(
    <ToastProvider>
      <SettingsForm initialProfile={initialProfile} />
    </ToastProvider>,
  );
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
    renderSettings(profile());

    expect(screen.getByRole("radio", { name: "No default" })).toHaveAttribute("checked", "");
  });

  it("pre-selects the saved target role", () => {
    renderSettings(profile({ target_role: "backend" }));

    expect(screen.getByRole("radio", { name: "Backend" })).toBeChecked();
  });

  it("saves the selected target role", async () => {
    renderSettings(profile());

    fireEvent.click(screen.getByRole("radio", { name: "Frontend" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ target_role: "frontend" });
  });

  it("saves null when the target role is cleared back to No default", async () => {
    renderSettings(profile({ target_role: "backend" }));

    fireEvent.click(screen.getByRole("radio", { name: "No default" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ target_role: null });
  });

  it("pre-fills and saves the display name", async () => {
    renderSettings(profile({ display_name: "Ada" }));

    const nameInput = screen.getByLabelText("Display name");
    expect(nameInput).toHaveValue("Ada");

    fireEvent.change(nameInput, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ display_name: "Ada Lovelace" });
  });

  it("clears the display name to null when emptied", async () => {
    renderSettings(profile({ display_name: "Ada" }));

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({ display_name: null });
  });

  it("pre-fills the saved resume background, skills, and years of experience", () => {
    renderSettings(
      profile({
        candidate_background: "I have five years of backend experience.",
        skills: ["Python", "SQL"],
        years_experience: 5,
      }),
    );

    expect(screen.getByLabelText("Your background")).toHaveValue(
      "I have five years of backend experience.",
    );
    expect(screen.getByLabelText("Primary skills (comma-separated)")).toHaveValue("Python, SQL");
    expect(screen.getByLabelText("Years of experience")).toHaveValue(5);
  });

  it("saves edited resume background, skills, and years of experience", async () => {
    renderSettings(profile());

    fireEvent.change(screen.getByLabelText("Your background"), {
      target: { value: "I build backend systems." },
    });
    fireEvent.change(screen.getByLabelText("Primary skills (comma-separated)"), {
      target: { value: "Python, Docker" },
    });
    fireEvent.change(screen.getByLabelText("Years of experience"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(lastRequestBody()).toMatchObject({
      candidate_background: "I build backend systems.",
      skills: ["Python", "Docker"],
      years_experience: 3,
    });
  });

  it("disables Save changes until something is actually edited", async () => {
    renderSettings(profile({ display_name: "Ada" }));

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada L." } });
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());

    // A successful save becomes the new baseline — nothing left to save until edited again.
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("normalizes whitespace and stops showing Saved after another edit", async () => {
    renderSettings(profile());
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "  Ada  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Grace" } });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("keeps edits made while a save is in flight dirty", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    renderSettings(profile());
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Grace" } });
    complete(new Response(JSON.stringify(profile({ display_name: "Ada" }))));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    expect(screen.getByLabelText("Display name")).toHaveValue("Grace");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
