import { TranscriptHighlight, type TranscriptPart } from "./transcript-highlight";

/** What you said next to the improved/reference version the evaluator wrote — side by side from
 * tablet width up, stacked on a phone. Both come straight from the stored report; nothing is
 * generated client-side. */
export function AnswerComparison({
  yours,
  improved,
  improvedLabel,
  improvedHint,
}: {
  yours: TranscriptPart[];
  improved: string;
  improvedLabel: string;
  improvedHint: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="border-line flex flex-col gap-2 rounded-[var(--radius-tile)] border p-4">
        <h3 className="text-text text-sm font-semibold">Your answer</h3>
        <p className="text-muted text-xs">What you said. Filler words are underlined.</p>
        <TranscriptHighlight parts={yours} className="text-text text-sm leading-relaxed" />
      </div>
      <div className="border-mint/30 bg-mint/5 flex flex-col gap-2 rounded-[var(--radius-tile)] border p-4">
        <h3 className="text-text text-sm font-semibold">{improvedLabel}</h3>
        <p className="text-muted text-xs">{improvedHint}</p>
        <p className="text-text text-sm leading-relaxed">{improved}</p>
      </div>
    </div>
  );
}
