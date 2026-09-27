import type { Rubric } from "@/lib/interview/types";

export interface RubricAreaInsight {
  key: string;
  label: string;
  score: number;
  praise: string;
}

// One line naming *why* that dimension mattered here, so the callout reads as specific
// feedback rather than generic "great job!" praise — the same reasoning the LLM prompt asks
// for in its own strengths/improvements (see apps/api/app/prompts/feedback.py). Keyed by
// category so the report never shows STAR labels for a technical/situational answer.
const RUBRIC_FIELD_INFO: Record<
  Rubric["category"],
  Record<string, { label: string; praise: string }>
> = {
  behavioral: {
    situation: { label: "Situation", praise: "you set up the context clearly" },
    task: { label: "Task", praise: "you were clear about what you were responsible for" },
    action: { label: "Action", praise: "you walked through the steps you actually took" },
    result: { label: "Result", praise: "you connected your work to a concrete outcome" },
  },
  technical: {
    correctness: { label: "Correctness", praise: "your technical content was accurate" },
    depth: { label: "Depth", praise: "you went well past a surface-level answer" },
    tradeoffs: { label: "Tradeoffs", praise: "you weighed alternatives, not just one approach" },
    communication: { label: "Communication", praise: "you explained your reasoning clearly" },
  },
  situational: {
    problem_framing: {
      label: "Problem framing",
      praise: "you correctly identified what was going on",
    },
    prioritization: { label: "Prioritization", praise: "you focused on what mattered most first" },
    judgment: { label: "Judgment", praise: "your proposed approach was sound" },
    communication: { label: "Communication", praise: "you explained your reasoning clearly" },
  },
};

const RUBRIC_FIELD_ORDER: Record<Rubric["category"], string[]> = {
  behavioral: ["situation", "task", "action", "result"],
  technical: ["correctness", "depth", "tradeoffs", "communication"],
  situational: ["problem_framing", "prioritization", "judgment", "communication"],
};

// Below this, "your strongest area" would be damning with faint praise — better to say
// nothing than to call a 4/10 a highlight.
const STRONG_ENOUGH_TO_HIGHLIGHT = 7;

export function rubricAreas(rubric: Rubric): { key: string; label: string; score: number }[] {
  const fieldInfo = RUBRIC_FIELD_INFO[rubric.category];
  return RUBRIC_FIELD_ORDER[rubric.category].map((key) => ({
    key,
    label: fieldInfo[key]!.label,
    score: (rubric as unknown as Record<string, number>)[key]!,
  }));
}

/** Picks the highest-scoring rubric dimension to praise by name, so the report leads with a
 * specific, genuine strength before any improvements — the "grow stronger concepts" half of
 * coaching, not just "here's what's wrong." Returns null when even the best score isn't strong
 * enough to call out (ties go to whichever key comes first in field order). */
export function strongestRubricArea(rubric: Rubric): RubricAreaInsight | null {
  const fieldInfo = RUBRIC_FIELD_INFO[rubric.category];
  const areas = rubricAreas(rubric);
  const best = areas.reduce((best, area) => (area.score > best.score ? area : best));

  if (best.score < STRONG_ENOUGH_TO_HIGHLIGHT) return null;

  return { ...best, praise: fieldInfo[best.key]!.praise };
}
