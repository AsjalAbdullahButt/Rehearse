import { describe, expect, it } from "vitest";

import { strongestStarArea } from "@/lib/interview/star-insights";

describe("strongestStarArea", () => {
  it("picks the highest-scoring dimension when it clears the highlight threshold", () => {
    const insight = strongestStarArea({ situation: 5, task: 6, action: 9, result: 7 });

    expect(insight?.key).toBe("action");
    expect(insight?.score).toBe(9);
  });

  it("returns null when even the best score is below the threshold", () => {
    const insight = strongestStarArea({ situation: 4, task: 5, action: 6, result: 3 });

    expect(insight).toBeNull();
  });

  it("returns null right below the threshold and a result right at it", () => {
    expect(strongestStarArea({ situation: 6, task: 6, action: 6, result: 6 })).toBeNull();
    expect(strongestStarArea({ situation: 7, task: 6, action: 6, result: 6 })?.key).toBe(
      "situation",
    );
  });

  it("breaks a tie in favor of the earlier STAR dimension", () => {
    const insight = strongestStarArea({ situation: 8, task: 8, action: 5, result: 5 });

    expect(insight?.key).toBe("situation");
  });
});
