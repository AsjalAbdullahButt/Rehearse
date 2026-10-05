/** One shared reading of "how good is this score", so the dashboard, history, report, skills and
 * retry comparison all say the same thing. Every band has a text label — colour alone is never
 * the signal. */
export type ScoreBand = "excellent" | "strong" | "developing" | "needs-practice";

export interface ScoreBandInfo {
  band: ScoreBand;
  label: string;
  /** Badge tone (see components/ui/badge.tsx). */
  tone: "mint" | "lime" | "amber" | "coral";
  /** A non-colour glyph so the band survives greyscale and colour-blindness. */
  glyph: string;
}

const BANDS: Record<ScoreBand, ScoreBandInfo> = {
  excellent: { band: "excellent", label: "Excellent", tone: "mint", glyph: "★" },
  strong: { band: "strong", label: "Strong", tone: "lime", glyph: "▲" },
  developing: { band: "developing", label: "Developing", tone: "amber", glyph: "◆" },
  "needs-practice": { band: "needs-practice", label: "Needs practice", tone: "coral", glyph: "●" },
};

/** Bands on a 0–100 scale: 90+ Excellent, 75–89 Strong, 60–74 Developing, below 60 Needs practice. */
export function scoreBand(percent: number): ScoreBandInfo {
  if (percent >= 90) return BANDS.excellent;
  if (percent >= 75) return BANDS.strong;
  if (percent >= 60) return BANDS.developing;
  return BANDS["needs-practice"];
}

/** Same bands for the API's 0–10 answer/session scores. */
export function scoreBandFromTen(score: number): ScoreBandInfo {
  return scoreBand(score * 10);
}
