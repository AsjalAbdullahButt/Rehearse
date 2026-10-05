import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-session-expiry", () => ({ useSessionExpiry: () => vi.fn() }));

import type {
  CompetencyMastery,
  InterviewSession,
  PracticePlan,
  ReadinessOut,
} from "@/lib/interview/types";

import { DashboardView } from "./dashboard-view";

function session(overrides: Partial<InterviewSession>): InterviewSession {
  return {
    id: "s1",
    user_id: "u1",
    role: "backend",
    role_title: null,
    job_target_id: null,
    panel: false,
    difficulty: "medium",
    experience_level: "mid",
    focus: "mixed",
    question_count: 5,
    answer_cap_s: 120,
    company: null,
    industry: null,
    interviewer_style: null,
    language: null,
    status: "completed",
    current_question_number: 5,
    started_at: "2026-10-01T10:00:00Z",
    ended_at: null,
    current_question: null,
    ...overrides,
  } as InterviewSession;
}

function skill(overrides: Partial<CompetencyMastery>): CompetencyMastery {
  return {
    role: "backend",
    competency: "sql",
    name: "SQL & Databases",
    mastery: 80,
    confidence: 70,
    questions_attempted: 4,
    successful_attempts: 3,
    highest_level: 3,
    last_practiced_at: null,
    ...overrides,
  };
}

const readiness: ReadinessOut = {
  role: "backend",
  score: 68,
  coverage: 70,
  total_attempts: 9,
  categories: [],
  strongest: "sql",
  main_risk: "caching",
  drivers: [],
  explanation: ["Based on 9 answers covering 70% of this role's skill plan."],
};

const plan: PracticePlan = {
  role: "backend",
  today: [
    {
      competency: "caching",
      name: "Caching",
      mastery: 30,
      interval_days: 1,
      due_at: "2026-10-01T00:00:00",
      days_until_due: -2,
      is_due: true,
    },
  ],
  upcoming: [],
  question_count: 3,
  estimated_minutes: 9,
  focus_topics: ["caching"],
};

const base = { role: null, readiness: null, plan: null, skills: [] as CompetencyMastery[] };

describe("DashboardView", () => {
  it("welcomes a brand-new user with one clear action and no invented numbers", () => {
    render(<DashboardView sessions={[]} {...base} />);

    expect(screen.getByRole("link", { name: "Start your first interview" })).toHaveAttribute(
      "href",
      "/interview",
    );
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Recent interviews")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills to work on")).not.toBeInTheDocument();
  });

  it("puts an unfinished interview first, with resume and an explicit way to end it", () => {
    render(
      <DashboardView
        sessions={[
          session({ id: "done", status: "completed" }),
          session({
            id: "open",
            status: "in_progress",
            current_question_number: 3,
            role: "devops-engineer",
            role_title: "DevOps Engineer",
          }),
        ]}
        {...base}
      />,
    );

    expect(screen.getByText(/DevOps Engineer interview · question 3 of 5/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume interview" })).toHaveAttribute(
      "href",
      "/interview?session=open",
    );
    expect(screen.getByRole("button", { name: "End without finishing" })).toBeInTheDocument();
  });

  it("shows readiness, today's practice and the weakest skills for the practised role", () => {
    render(
      <DashboardView
        sessions={[session({})]}
        role="backend"
        readiness={readiness}
        plan={plan}
        skills={[
          skill({}),
          skill({ competency: "caching", name: "Caching", mastery: 30 }),
          skill({ competency: "security", name: "Security", mastery: 55 }),
          skill({ competency: "testing", name: "Testing", mastery: 20, questions_attempted: 1 }),
        ]}
      />,
    );

    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText(/Based on 9 answers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start today's practice" })).toHaveAttribute(
      "href",
      "/interview?role=backend&count=3&topics=caching",
    );

    const weak = screen.getByText("Skills to work on").closest("div")!;
    const names = within(weak)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    // Lowest mastery first; "Testing" (1 answer) is too thin to call weak.
    expect(names[0]).toContain("Caching");
    expect(names[1]).toContain("Security");
    expect(weak).not.toHaveTextContent("Testing");
  });

  it("says there is not enough practice rather than scoring thin data", () => {
    render(
      <DashboardView
        sessions={[session({})]}
        role="backend"
        readiness={{ ...readiness, score: null }}
        plan={null}
        skills={[]}
      />,
    );

    expect(screen.getByText("Not enough practice yet to score")).toBeInTheDocument();
  });

  it("labels every recent interview honestly, including ones ended early", () => {
    render(
      <DashboardView
        sessions={[
          session({ id: "a", status: "completed" }),
          session({ id: "b", status: "ended_early" }),
        ]}
        {...base}
      />,
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Ended early")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Backend/ })[1]).toHaveAttribute(
      "href",
      "/session/b/summary",
    );
  });
});
