/** The /interview link that re-runs a past session's setup (role, difficulty, focus, length and
 * time limit). Shared by the session summary and the history list so both build it the same way. */
export function repeatSetupHref(session: {
  role: string;
  difficulty: string;
  focus: string;
  question_count: number;
  answer_cap_s: number;
}): string {
  const params = new URLSearchParams({
    role: session.role,
    difficulty: session.difficulty,
    focus: session.focus,
    count: String(session.question_count),
    cap: String(session.answer_cap_s),
  });
  return `/interview?${params.toString()}`;
}
