import { SkillMasteryView } from "@/components/progress/skill-mastery-view";
import { RecoveryState } from "@/components/ui/recovery-state";
import { fetchMastery, fetchPracticePlan, fetchReadiness } from "@/lib/interview/server";

export default async function MasteryPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: requestedRole } = await searchParams;
  const mastery = await fetchMastery().catch(() => undefined);

  if (mastery === undefined) {
    return (
      <RecoveryState
        title="Could not load your skills"
        description="Please try again in a moment."
        retry
      />
    );
  }
  if (mastery === null || mastery.competencies.length === 0) {
    return (
      <RecoveryState
        title="No skill data yet"
        description="Answer a few interview questions and your skill mastery will appear here."
      />
    );
  }

  // Roles ordered by how much practice they hold, so the default view is the one that matters.
  const attemptsByRole = new Map<string, number>();
  for (const skill of mastery.competencies) {
    attemptsByRole.set(
      skill.role,
      (attemptsByRole.get(skill.role) ?? 0) + skill.questions_attempted,
    );
  }
  const roles = [...attemptsByRole.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const role = requestedRole && attemptsByRole.has(requestedRole) ? requestedRole : roles[0]!;

  const skills = mastery.competencies.filter((s) => s.role === role);
  const ranked = skills
    .filter((s) => s.questions_attempted >= 2)
    .sort((a, b) => a.mastery - b.mastery);
  const [readiness, plan] = await Promise.all([
    fetchReadiness(role).catch(() => null),
    fetchPracticePlan(role).catch(() => null),
  ]);

  return (
    <SkillMasteryView
      role={role}
      roles={roles}
      skills={skills}
      strongest={ranked.at(-1)?.competency ?? null}
      weakest={ranked[0]?.competency ?? null}
      readiness={readiness}
      plan={plan}
    />
  );
}
