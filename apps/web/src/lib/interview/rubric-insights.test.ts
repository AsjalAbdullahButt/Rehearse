import { describe, expect, it } from "vitest";

import { rubricAreas, strongestRubricArea } from "@/lib/interview/rubric-insights";
import type { BehavioralRubric, SituationalRubric, TechnicalRubric } from "@/lib/interview/types";

function behavioral(overrides: Partial<BehavioralRubric> = {}): BehavioralRubric {
  return { category: "behavioral", situation: 5, task: 5, action: 5, result: 5, ...overrides };
}

describe("strongestRubricArea (behavioral)", () => {
  it("picks the highest-scoring dimension when it clears the highlight threshold", () => {
    const insight = strongestRubricArea(
      behavioral({ situation: 5, task: 6, action: 9, result: 7 }),
    );

    expect(insight?.key).toBe("action");
    expect(insight?.score).toBe(9);
  });

  it("returns null when even the best score is below the threshold", () => {
    const insight = strongestRubricArea(
      behavioral({ situation: 4, task: 5, action: 6, result: 3 }),
    );

    expect(insight).toBeNull();
  });

  it("returns null right below the threshold and a result right at it", () => {
    expect(
      strongestRubricArea(behavioral({ situation: 6, task: 6, action: 6, result: 6 })),
    ).toBeNull();
    expect(
      strongestRubricArea(behavioral({ situation: 7, task: 6, action: 6, result: 6 }))?.key,
    ).toBe("situation");
  });

  it("breaks a tie in favor of the earlier field in category order", () => {
    const insight = strongestRubricArea(
      behavioral({ situation: 8, task: 8, action: 5, result: 5 }),
    );

    expect(insight?.key).toBe("situation");
  });
});

describe("strongestRubricArea (technical)", () => {
  const technical: TechnicalRubric = {
    category: "technical",
    correctness: 9,
    depth: 6,
    tradeoffs: 5,
    communication: 7,
  };

  it("never returns a STAR label for a technical rubric", () => {
    const insight = strongestRubricArea(technical);

    expect(insight?.key).toBe("correctness");
    expect(insight?.label).toBe("Correctness");
  });
});

describe("strongestRubricArea (situational)", () => {
  const situational: SituationalRubric = {
    category: "situational",
    problem_framing: 8,
    prioritization: 6,
    judgment: 6,
    communication: 6,
  };

  it("uses situational field labels, not STAR or technical ones", () => {
    const insight = strongestRubricArea(situational);

    expect(insight?.key).toBe("problem_framing");
    expect(insight?.label).toBe("Problem framing");
  });
});

describe("rubricAreas", () => {
  it("returns all four fields in category order with labels", () => {
    const areas = rubricAreas(behavioral());

    expect(areas.map((a) => a.key)).toEqual(["situation", "task", "action", "result"]);
    expect(areas.every((a) => typeof a.label === "string")).toBe(true);
  });
});
