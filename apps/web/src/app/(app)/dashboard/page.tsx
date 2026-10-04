import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  fetchMastery,
  fetchPracticePlan,
  fetchReadiness,
  fetchRecentSessions,
} from "@/lib/interview/server";

export default async function DashboardPage() {
  // Each block degrades on its own: a failed mastery fetch must not hide the person's in-progress
  // interview, which is the one thing here that is hard to find another way.
  const [sessions, mastery] = await Promise.all([
    fetchRecentSessions(10).catch(() => null),
    fetchMastery().catch(() => null),
  ]);

  const attemptsByRole = new Map<string, number>();
  for (const skill of mastery?.competencies ?? []) {
    attemptsByRole.set(
      skill.role,
      (attemptsByRole.get(skill.role) ?? 0) + skill.questions_attempted,
    );
  }
  // The role with the most practice is the one the person is actually preparing for.
  const role = [...attemptsByRole.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const [readiness, plan] = role
    ? await Promise.all([
        fetchReadiness(role).catch(() => null),
        fetchPracticePlan(role).catch(() => null),
      ])
    : [null, null];

  return (
    <DashboardView
      sessions={sessions ?? []}
      role={role}
      readiness={readiness}
      plan={plan}
      skills={(mastery?.competencies ?? []).filter((skill) => skill.role === role)}
    />
  );
}
