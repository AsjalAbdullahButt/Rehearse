import Link from "next/link";

import { Card } from "@/components/ui/card";
import type {
  CompetencyMastery,
  PracticePlan,
  ReadinessOut,
  ScheduledSkill,
} from "@/lib/interview/types";
import { cn } from "@/lib/utils";

function roleLabel(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dueLabel(skill: ScheduledSkill): string {
  if (skill.is_due) return "Due now";
  if (skill.days_until_due <= 1) return "Tomorrow";
  return `In ${skill.days_until_due} days`;
}

function practiceHref(role: string, plan: PracticePlan): string {
  const params = new URLSearchParams({
    role,
    count: "3",
    topics: plan.focus_topics.join(","),
  });
  return `/interview?${params.toString()}`;
}

function MasteryBar({ skill }: { skill: CompetencyMastery }) {
  const thin = skill.questions_attempted < 2;
  return (
    <li className="flex items-center gap-3">
      <span className="text-text w-40 shrink-0 truncate text-sm">{skill.name}</span>
      <div
        role="progressbar"
        aria-label={`${skill.name} mastery`}
        aria-valuenow={skill.mastery}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)]"
      >
        <div
          className={cn("h-full rounded-[var(--radius-pill)]", thin ? "bg-muted" : "bg-violet")}
          style={{ width: `${skill.mastery}%` }}
        />
      </div>
      <span className="font-mono-metric text-muted w-10 text-right text-xs tabular-nums">
        {skill.mastery}
      </span>
      <span className="text-muted hidden w-28 text-right text-xs sm:inline">
        {skill.questions_attempted} {skill.questions_attempted === 1 ? "answer" : "answers"}
        {thin ? " · early" : ""}
      </span>
    </li>
  );
}

export function SkillMasteryView({
  role,
  roles,
  skills,
  strongest,
  weakest,
  readiness,
  plan,
}: {
  role: string;
  roles: string[];
  skills: CompetencyMastery[];
  strongest: string | null;
  weakest: string | null;
  readiness: ReadinessOut | null;
  plan: PracticePlan | null;
}) {
  const nameOf = (key: string | null) =>
    key ? (skills.find((s) => s.competency === key)?.name ?? key) : null;
  const mainRisk =
    readiness?.main_risk &&
    (readiness.drivers.find((d) => d.competency === readiness.main_risk)?.name ??
      readiness.main_risk);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">Your skills</p>
        <h1 className="font-display text-text text-2xl font-bold">Skill mastery</h1>
        <p className="text-muted text-sm">
          Built only from the answers you have recorded. Scores firm up as you practise a skill
          more.
        </p>
      </div>

      {roles.length > 1 ? (
        <nav aria-label="Role" className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <Link
              key={r}
              href={`/mastery?role=${encodeURIComponent(r)}`}
              aria-current={r === role ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-4 text-sm",
                r === role ? "bg-lime/10 text-lime" : "text-muted hover:bg-surface-2",
              )}
            >
              {roleLabel(r)}
            </Link>
          ))}
        </nav>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
          {roleLabel(role)} readiness
        </h2>
        {readiness?.score != null ? (
          <p className="font-display text-text text-5xl font-bold">
            {readiness.score}
            <span className="text-muted text-xl"> / 100</span>
          </p>
        ) : (
          <p className="text-text text-lg font-medium">Not enough practice yet to score</p>
        )}
        {readiness?.categories.length ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {readiness.categories.map((c) => (
              <li key={c.category} className="text-muted">
                <span className="capitalize">{c.category}</span>{" "}
                <span className="text-text font-medium">{c.score}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {readiness?.explanation.map((line) => (
          <p key={line} className="text-muted text-sm">
            {line}
          </p>
        ))}
        <p className="text-muted text-xs">
          The Rehearse Readiness Score reflects your own practice against this role&apos;s skill
          plan. It is not a ranking against other candidates.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <span className="text-muted text-xs uppercase">Strongest skill</span>
          <span className="text-text text-lg font-medium">{nameOf(strongest) ?? "—"}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-muted text-xs uppercase">Weakest skill</span>
          <span className="text-text text-lg font-medium">{nameOf(weakest) ?? "—"}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-muted text-xs uppercase">Biggest hiring risk</span>
          <span className="text-text text-lg font-medium">{mainRisk ?? "—"}</span>
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-text text-lg font-semibold">Today&apos;s practice</h2>
        {plan && plan.today.length > 0 ? (
          <>
            <p className="text-muted text-sm">
              About {plan.estimated_minutes} minutes · {plan.question_count} questions · focus:{" "}
              {plan.today.map((s) => s.name).join(", ")}
            </p>
            <Link
              href={practiceHref(role, plan)}
              className="bg-lime-fill text-lime-ink inline-flex h-11 w-fit items-center rounded-[var(--radius-pill)] px-6 text-sm font-medium"
            >
              Start today&apos;s practice
            </Link>
          </>
        ) : (
          <p className="text-muted text-sm">
            Nothing is due for review today. Weak skills come back sooner; mastered skills return
            every couple of weeks.
          </p>
        )}
        {plan && plan.upcoming.length > 0 ? (
          <ul className="border-line flex flex-col gap-1 border-t pt-3">
            {plan.upcoming.slice(0, 6).map((s) => (
              <li key={s.competency} className="flex justify-between text-sm">
                <span className="text-text">{s.name}</span>
                <span className="text-muted">{dueLabel(s)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-text text-lg font-semibold">By skill</h2>
        <ul className="flex flex-col gap-3">
          {skills.map((skill) => (
            <MasteryBar key={skill.competency} skill={skill} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
