import { Badge } from "@/components/ui/badge";
import { type ScoreBandInfo } from "@/lib/score-band";

/** The band name with a glyph — the single way a score's quality is communicated in text. */
export function ScoreBadge({ band, className }: { band: ScoreBandInfo; className?: string }) {
  return (
    <Badge tone={band.tone} className={className}>
      <span aria-hidden="true">{band.glyph}</span>
      {band.label}
    </Badge>
  );
}
