import { Card } from "@/components/ui/card";
import type { AttemptComparison as AttemptComparisonData } from "@/lib/interview/types";

function label(key: string): string {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

/** Direction arrow so a change reads without colour; decreases are neutral, not alarming. */
function arrow(value: number): string {
  return value > 0 ? "↑ " : value < 0 ? "↓ " : "";
}

/** First attempt vs. latest, with every number derived from stored scores and metrics (see
 * apps/api/app/services/comparison.py) — no AI-written claims about improvement. */
export function AttemptComparison({ comparison }: { comparison: AttemptComparisonData }) {
  const first = comparison.attempts[0];
  const latest = comparison.attempts[comparison.attempts.length - 1];
  if (!first || !latest || comparison.attempts.length < 2) return null;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-text text-lg font-semibold">How your retry compares</h2>
        <p className="text-muted text-sm">
          Attempt 1 vs. attempt {latest.attempt_number}
          {comparison.overall_delta !== null ? (
            <>
              {" "}
              — overall{" "}
              <span className={comparison.overall_delta > 0 ? "text-mint" : "text-muted"}>
                {arrow(comparison.overall_delta)}
                {signed(comparison.overall_delta)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <table className="w-full text-left text-sm">
        <caption className="sr-only">Score for each attempt</caption>
        <thead>
          <tr className="text-muted text-xs uppercase">
            <th scope="col" className="py-1 font-medium">
              Area
            </th>
            <th scope="col" className="py-1 font-medium">
              Attempt 1
            </th>
            <th scope="col" className="py-1 font-medium">
              Attempt {latest.attempt_number}
            </th>
            <th scope="col" className="py-1 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {comparison.components.map((row) => (
            <tr key={row.key} className="border-line border-t">
              <th scope="row" className="text-text py-2 font-normal">
                {label(row.key)}
              </th>
              <td className="font-mono-metric py-2 tabular-nums">{row.before}</td>
              <td className="font-mono-metric py-2 tabular-nums">{row.after}</td>
              <td
                className={`font-mono-metric py-2 tabular-nums ${
                  row.delta > 0 ? "text-mint" : "text-muted"
                }`}
              >
                {arrow(row.delta)}
                {signed(row.delta, 0)}
              </td>
            </tr>
          ))}
          <tr className="border-line border-t">
            <th scope="row" className="text-text py-2 font-normal">
              Filler words / 100 words
            </th>
            <td className="font-mono-metric py-2 tabular-nums">
              {first.filler_rate_per_100_words}
            </td>
            <td className="font-mono-metric py-2 tabular-nums">
              {latest.filler_rate_per_100_words}
            </td>
            <td className="font-mono-metric text-muted py-2 tabular-nums">
              {comparison.filler_rate_delta !== null ? signed(comparison.filler_rate_delta) : "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <ul className="flex flex-col gap-2">
        {comparison.summary.map((line) => (
          <li key={line} className="text-text text-sm">
            {line}
          </li>
        ))}
      </ul>

      <details>
        <summary className="text-muted cursor-pointer text-sm font-medium">
          Compare transcripts side by side
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[first, latest].map((attempt) => (
            <div key={attempt.answer_id} className="flex flex-col gap-2">
              <h3 className="text-muted text-xs font-medium uppercase">
                Attempt {attempt.attempt_number}
              </h3>
              <p className="text-text text-sm leading-relaxed">{attempt.transcript}</p>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
