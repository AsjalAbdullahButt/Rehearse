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

function next() {
  fireEvent.click(screen.getByRole("button", { name: /^(Continue|Next)$/ }));
}

/** Resume → Job. */
function toJob() {
  next();
}
/** … → Preferences. */
function toPreferences() {
  next();
  next();
  next();
}
/** From the Job step onward: Job → Interview → Preferences → Review. */
function jobToReview() {
  next();
  next();
  next();
}
/** … → Review. */
function toReview() {
  next();
  next();
  next();
  next();
}
function start() {
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
}

/** The common case: pick a role on the Job step, then walk to Review and start. */
function chooseRoleAndStart(role = "Backend") {
  toJob();
  fireEvent.click(screen.getByRole("radio", { name: role }));
  next();
  next();
  next();
  start();
}

describe("SessionSetupForm", () => {
  it("shows a stepper and begins on the optional resume step", () => {
    renderForm();

    expect(screen.getByRole("navigation", { name: "Setup progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start with your resume" })).toBeInTheDocument();
  });

  it("will not leave the Job step until a role is chosen, and only complains after trying", () => {
    renderForm();
    toJob();

    expect(screen.queryByText(/Choose a role, or type one/)).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/Choose a role, or type one/);
    expect(screen.getByRole("heading", { name: "What role are you preparing for?" })).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    expect(screen.getByRole("heading", { name: "What kind of interview?" })).toBeVisible();
  });

  it("keeps entries when going back and forward between steps", () => {
    renderForm();
    toJob();
    fireEvent.change(screen.getByLabelText("Target company (optional)"), {
      target: { value: "Acme Corp" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("Target company (optional)")).toHaveValue("Acme Corp");
    expect(screen.getByRole("radio", { name: "Backend" })).toBeChecked();
  });

  it("lets the candidate interview for a custom role not in the preset list", () => {
    const onSubmit = renderForm();
    toJob();
    fireEvent.change(screen.getByRole("textbox", { name: "Or a different role" }), {
      target: { value: "  DevOps Engineer " },
    });
    jobToReview();
    start();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: "DevOps Engineer" }));
  });

  it("a typed custom role overrides a chosen preset, and picking a preset clears it", () => {
    const onSubmit = renderForm();
    toJob();

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Or a different role" }), {
      target: { value: "Cloud Engineer" },
    });
    jobToReview();
    start();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ role: "Cloud Engineer" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit role" }));
    fireEvent.click(screen.getByRole("radio", { name: "Frontend" }));
    next();
    next();
    next();
    start();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ role: "frontend" }));
  });

  it("sends the chosen interview language, defaulting to English", () => {
    const onSubmit = renderForm();
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ language: "en" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit questions" }));
    fireEvent.click(screen.getByRole("radio", { name: "Urdu" }));
    next();
    start();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ language: "ur" }));
  });

  it("sends the selected interview mode", () => {
    const onSubmit = renderForm();
    toJob();
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /System design/ }));
    next();
    next();
    start();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interview_mode: "system_design" }),
    );
  });

  it("defaults coding-style modes to a technical focus", () => {
    const onSubmit = renderForm();
    toJob();
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /Coding/ }));
    next();
    next();
    start();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interview_mode: "coding", focus: "technical" }),
    );
  });

  it("does not override a focus the candidate explicitly chose", () => {
    const onSubmit = renderForm();
    toJob();
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    fireEvent.click(screen.getByRole("radio", { name: /^Behavioral/ }));
    fireEvent.click(screen.getByRole("radio", { name: /System design/ }));
    next();
    next();
    start();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interview_mode: "system_design", focus: "behavioral" }),
    );
  });

  it("only offers a panel interview when the API has it switched on", () => {
    const { unmount } = render(
      <ToastProvider>
        <SessionSetupForm isSubmitting={false} onSubmit={vi.fn()} />
      </ToastProvider>,
    );
    expect(
      screen.queryByRole("checkbox", { name: /Panel interview/, hidden: true }),
    ).not.toBeInTheDocument();
    unmount();

    const onSubmit = renderForm({ panelAvailable: true });
    toJob();
    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: /Panel interview/ }));
    next();
    next();
    start();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ panel: true }));
  });

  it("is a normal single-interviewer session unless panel is ticked", () => {
    const onSubmit = renderForm({ panelAvailable: true });
    chooseRoleAndStart();
    expect(onSubmit.mock.calls[0]![0].panel).toBeUndefined();
  });

  it("pre-fills focus topics from a practice-plan link", () => {
    const onSubmit = renderForm({ initialFocusTopics: ["caching", "sql"] });
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ focus_topics: ["caching", "sql"] }),
    );
  });

  it("defaults the time cap to 120s when no initial value is given", () => {
    const onSubmit = renderForm();
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 120 }));
  });

  it("pre-fills the time cap from initialAnswerCapS (e.g. the candidate's saved default)", () => {
    const onSubmit = renderForm({ initialAnswerCapS: 300 });
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 300 }));
  });

  it("falls back to the default time cap when initialAnswerCapS isn't a valid option", () => {
    const onSubmit = renderForm({ initialAnswerCapS: 999 });
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ answer_cap_s: 120 }));
  });

  it("pre-fills focus, difficulty, and question count from a repeat-setup/practice-weak-area link", () => {
    const onSubmit = renderForm({
      initialFocus: "technical",
      initialDifficulty: "hard",
      initialQuestionCount: 8,
    });
    chooseRoleAndStart();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ focus: "technical", difficulty: "hard", question_count: 8 }),
    );
  });

  it("pre-selects the role from initialRole", () => {
    const onSubmit = renderForm({ initialRole: "frontend" });

    toReview();
    start();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: "frontend" }));
  });

  it("pre-fills and submits the saved resume background/skills/years from Settings", () => {
    const onSubmit = renderForm({
      initialRole: "backend",
      initialCandidateBackground: "I have five years of backend experience.",
      initialSkills: ["Python", "SQL"],
      initialYearsExperience: 5,
    });

    toJob();
    expect(screen.getByText("I have five years of backend experience.")).toBeInTheDocument();
    jobToReview();
    start();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate_background: "I have five years of backend experience.",
        skills: ["Python", "SQL"],
        years_experience: 5,
      }),
    );
  });

  it("blocks an out-of-range years-of-experience value with an inline message", () => {
    const onSubmit = renderForm({ initialRole: "backend" });
    toJob();
    fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "81" } });
    next();

    expect(screen.getByRole("alert")).toHaveTextContent(/between 0 and 80/);
    expect(screen.getByRole("heading", { name: "What role are you preparing for?" })).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not start the interview when Enter is pressed before the review step", () => {
    const onSubmit = renderForm({ initialRole: "backend" });
    toJob();
    fireEvent.submit(screen.getByLabelText("Target company (optional)").closest("form")!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "What kind of interview?" })).toBeVisible();
  });

  it("shows the chosen settings on the review step with a way back to edit each", () => {
    renderForm({ initialRole: "backend", initialQuestionCount: 8 });
    toPreferences();
    next();

    expect(screen.getByRole("heading", { name: "Review and start" })).toBeVisible();
    expect(screen.getByText("Backend", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/8 questions · 2 min per answer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit difficulty" }));
    expect(screen.getByRole("heading", { name: "Difficulty and preferences" })).toBeVisible();
  });
});
