import type { StarScores } from "@/lib/interview/types";

export type StarAreaKey = keyof StarScores;

export interface StarAreaInsight {
  key: StarAreaKey;
  label: string;
  score: number;
  praise: string;
}

// One line naming *why* that STAR dimension mattered here, so the callout reads as specific
// feedback rather than generic "great job!" praise — the same reasoning the LLM prompt asks
// for in its own tips (see apps/api/app/prompts/feedback.py).
const STAR_AREA_INFO: Record<StarAreaKey, { label: string; praise: string }> = {
  situation: { label: "Situation", praise: "you set up the context clearly" },
  task: { label: "Task", praise: "you were clear about what you were responsible for" },
  action: { label: "Action", praise: "you walked through the steps you actually took" },
  result: { label: "Result", praise: "you connected your work to a concrete outcome" },
};

const STAR_AREA_ORDER: StarAreaKey[] = ["situation", "task", "action", "result"];

// Below this, "your strongest area" would be damning with faint praise — better to say
// nothing than to call a 4/10 a highlight.
const STRONG_ENOUGH_TO_HIGHLIGHT = 7;

/** Picks the highest-scoring STAR dimension to praise by name, so the report leads with a
 * specific, genuine strength before any tips — the "grow stronger concepts" half of coaching,
 * not just "here's what's wrong." Returns null when even the best score isn't strong enough
 * to call out (ties go to whichever key comes first in STAR_AREA_ORDER). */
export function strongestStarArea(scores: StarScores): StarAreaInsight | null {
  const best = STAR_AREA_ORDER.reduce((best, key) => (scores[key] > scores[best] ? key : best));

  if (scores[best] < STRONG_ENOUGH_TO_HIGHLIGHT) return null;

  return { key: best, score: scores[best], ...STAR_AREA_INFO[best] };
}
