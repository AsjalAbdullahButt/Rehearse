import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CompetencyMastery, PracticePlan, ReadinessOut } from "@/lib/interview/types";

import { SkillMasteryView } from "./skill-mastery-view";

function skill(overrides: Partial<CompetencyMastery>): CompetencyMastery {
  return {
    role: "backend",
    competency: "sql",
    name: "SQL & Databases",
    mastery: 82,
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
  score: 71,
  coverage: 80,
  total_attempts: 9,
  categories: [{ category: "technical", score: 65 }],
  strongest: "sql",
  main_risk: "caching",
  drivers: [
    {
      competency: "caching",
      name: "Caching",
      weight: 0.3,
      mastery: 30,
      confidence: 60,
      attempts: 3,
      assessed: true,
      resume_evidence: "unknown",
    },
  ],
  explanation: ["Based on 9 answers covering 80% of this role's skill plan."],
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
  upcoming: [
    {
      competency: "sql",
      name: "SQL & Databases",
      mastery: 82,
      interval_days: 7,
      due_at: "2026-10-12T00:00:00",
      days_until_due: 3,
      is_due: false,
    },
  ],
  question_count: 3,
  estimated_minutes: 9,
  focus_topics: ["caching"],
};

function renderView(overrides: Partial<Parameters<typeof SkillMasteryView>[0]> = {}) {
  return render(
    <SkillMasteryView
      role="backend"
      roles={["backend"]}
      skills={[skill({}), skill({ competency: "caching", name: "Caching", mastery: 30 })]}
      strongest="sql"
      weakest="caching"
      readiness={readiness}
      plan={plan}
      {...overrides}
    />,
  );
}

describe("SkillMasteryView", () => {
  it("shows the readiness score with its explanation and no ranking claim", () => {
    renderView();

    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getByText(/Based on 9 answers/)).toBeInTheDocument();
    expect(screen.getByText(/not a ranking against other candidates/)).toBeInTheDocument();
  });

  it("says there is not enough practice instead of inventing a score", () => {
    renderView({ readiness: { ...readiness, score: null } });

    expect(screen.getByText("Not enough practice yet to score")).toBeInTheDocument();
  });

  it("identifies the strongest skill, weakest skill, and biggest risk", () => {
    renderView();

    const strongest = screen.getByText("Strongest skill").parentElement!;
    const weakest = screen.getByText("Weakest skill").parentElement!;
    const risk = screen.getByText("Biggest hiring risk").parentElement!;
    expect(strongest).toHaveTextContent("SQL & Databases");
    expect(weakest).toHaveTextContent("Caching");
    expect(risk).toHaveTextContent("Caching");
  });

  it("links today's practice to a session focused on the due skills", () => {
    renderView();

    const link = screen.getByRole("link", { name: "Start today's practice" });
    expect(link).toHaveAttribute("href", "/interview?role=backend&count=3&topics=caching");
    expect(screen.getByText(/About 9 minutes/)).toBeInTheDocument();
  });

  it("explains an empty practice day and still lists what is coming up", () => {
    renderView({ plan: { ...plan, today: [], question_count: 0, estimated_minutes: 0 } });

    expect(screen.getByText(/Nothing is due for review today/)).toBeInTheDocument();
    expect(screen.getByText("In 3 days")).toBeInTheDocument();
  });

  it("exposes each skill as an accessible progress bar", () => {
    renderView();

    expect(screen.getByRole("progressbar", { name: "SQL & Databases mastery" })).toHaveAttribute(
      "aria-valuenow",
      "82",
    );
  });

  it("only shows a role switcher when there is more than one role", () => {
    const { rerender } = renderView();
    expect(screen.queryByRole("navigation", { name: "Role" })).not.toBeInTheDocument();

    rerender(
      <SkillMasteryView
        role="backend"
        roles={["backend", "devops-engineer"]}
        skills={[skill({})]}
        strongest={null}
        weakest={null}
        readiness={null}
        plan={null}
      />,
    );
    expect(screen.getByRole("link", { name: "Devops Engineer" })).toHaveAttribute(
      "href",
      "/mastery?role=devops-engineer",
    );
  });
});
