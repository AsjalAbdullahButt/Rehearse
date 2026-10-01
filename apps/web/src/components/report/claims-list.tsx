import type { Claim } from "@/lib/interview/types";

const STATUS_LABELS: Record<string, string> = {
  unverified: "Not yet supported",
  partially_supported: "Partly supported",
  well_supported: "Well supported",
  contradictory: "Needs clarifying",
};

/** Statements that came up in the interview (from the candidate's answers or their resume) and
 * how well each has held up so far. Worded as preparation, never as doubt about the candidate. */
export function ClaimsList({ claims, heading }: { claims: Claim[]; heading: string }) {
  if (claims.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-muted text-xs font-medium tracking-wide uppercase">{heading}</h2>
      <ul className="flex flex-col gap-2">
        {claims.map((claim) => (
          <li
            key={claim.id}
            className="border-line flex flex-col gap-1 rounded-[var(--radius-tile)] border px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-text text-sm font-medium">{claim.claim_text}</span>
              <span className="text-muted text-xs">
                {STATUS_LABELS[claim.status] ?? claim.status}
                {claim.source === "resume" ? " · from your resume" : ""}
              </span>
            </div>
            {claim.note ? <p className="text-muted text-xs">{claim.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
