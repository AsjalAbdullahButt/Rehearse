import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn().mockResolvedValue(false),
}));

import { ToastProvider } from "@/components/ui/toast";
import type { SessionCreateInput } from "@/lib/interview/types";

import { SessionSetupForm } from "./session-setup-form";

// SessionSetupForm always renders ResumeUpload, which calls useToast() — a real ToastProvider
// (rather than a mock) is the simplest way to satisfy that without every test needing to know
// about a component two levels down.
function renderForm(props: Partial<Parameters<typeof SessionSetupForm>[0]> = {}) {
  const onSubmit = vi.fn<(value: SessionCreateInput) => void>();
  render(
    <ToastProvider>
      <SessionSetupForm isSubmitting={false} onSubmit={onSubmit} {...props} />
    </ToastProvider>,
  );
  return onSubmit;
}

describe("SessionSetupForm", () => {
  it("requires a role before Start is enabled", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));

    expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
  });

  it("lets the candidate interview for a custom role not in the preset list", () => {
    const onSubmit = renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: "Custom role" }), {
      target: { value: "  DevOps Engineer " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: "DevOps Engineer" }));
  });

  it("a typed custom role overrides a chosen preset, and picking a preset clears it", () => {
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Custom role" }), {
      target: { value: "Cloud Engineer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ role: "Cloud Engineer" }));

    fireEvent.click(screen.getByRole("radio", { name: "Frontend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ role: "frontend" }));
  });

  it("sends the chosen interview language, defaulting to English", () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ language: "en" }));

    fireEvent.click(screen.getByRole("radio", { name: "Urdu" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ language: "ur" }));
  });

  it("defaults the time cap to 120s when no initial value is given", () => {
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 120 }));
  });

  it("pre-fills the time cap from initialAnswerCapS (e.g. the candidate's saved default)", () => {
    const onSubmit = renderForm({ initialAnswerCapS: 300 });

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 300 }));
  });

  it("falls back to the default time cap when initialAnswerCapS isn't a valid option", () => {
    const onSubmit = renderForm({ initialAnswerCapS: 999 });

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 120 }));
  });

  it("pre-fills focus, difficulty, and question count from a repeat-setup/practice-weak-area link", () => {
    const onSubmit = renderForm({
      initialFocus: "technical",
      initialDifficulty: "hard",
      initialQuestionCount: 8,
    });

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ focus: "technical", difficulty: "hard", question_count: 8 }),
    );
  });

  it("pre-selects the role from initialRole", () => {
    const onSubmit = renderForm({ initialRole: "frontend" });

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: "frontend" }));
  });

  it("pre-fills and submits the saved resume background/skills/years from Settings", () => {
    const onSubmit = renderForm({
      initialRole: "backend",
      initialCandidateBackground: "I have five years of backend experience.",
      initialSkills: ["Python", "SQL"],
      initialYearsExperience: 5,
    });

    // Personalization auto-expands when there's something saved to show, instead of hiding a
    // pre-filled value behind a collapsed "+ Personalize further" toggle.
    expect(screen.getByText("I have five years of backend experience.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate_background: "I have five years of backend experience.",
        skills: ["Python", "SQL"],
        years_experience: 5,
      }),
    );
  });

  it("does not auto-expand personalization when nothing is saved yet", () => {
    renderForm({ initialRole: "backend" });

    expect(
      screen.getByRole("button", { name: "+ Personalize further (optional)" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
