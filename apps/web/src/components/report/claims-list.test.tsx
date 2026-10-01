import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Claim } from "@/lib/interview/types";

import { ClaimsList } from "./claims-list";

function claim(overrides: Partial<Claim>): Claim {
  return {
    id: "c1",
    claim_text: "Reduced API latency by 40%",
    claim_type: "performance",
    importance: "high",
    metric: "40%",
    source: "answer",
    status: "unverified",
    note: "This claim may receive recruiter follow-up.",
    ...overrides,
  };
}

describe("ClaimsList", () => {
  it("renders nothing when there are no claims", () => {
    const { container } = render(<ClaimsList claims={[]} heading="Claims" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("describes support softly, as preparation rather than doubt", () => {
    render(<ClaimsList claims={[claim({})]} heading="Claims that need preparation" />);

    expect(screen.getByText("Claims that need preparation")).toBeInTheDocument();
    expect(screen.getByText("Reduced API latency by 40%")).toBeInTheDocument();
    expect(screen.getByText("Not yet supported")).toBeInTheDocument();
    expect(screen.getByText("This claim may receive recruiter follow-up.")).toBeInTheDocument();
    expect(screen.queryByText(/lie|false|dishonest/i)).not.toBeInTheDocument();
  });

  it("labels claims that came from the resume and shows supported ones without a warning", () => {
    render(
      <ClaimsList
        claims={[claim({ id: "c2", source: "resume", status: "well_supported", note: null })]}
        heading="Claims"
      />,
    );

    expect(screen.getByText(/Well supported/)).toHaveTextContent("from your resume");
    expect(screen.queryByText(/recruiter follow-up/)).not.toBeInTheDocument();
  });
});
