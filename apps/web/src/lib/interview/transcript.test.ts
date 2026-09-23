import { describe, expect, it } from "vitest";

import type { ApiTranscriptPart } from "./types";
import { toTranscriptParts } from "./transcript";

describe("toTranscriptParts", () => {
  it("maps text and filler parts through with their text", () => {
    const input: ApiTranscriptPart[] = [
      { type: "text", text: "So ", seconds: null },
      { type: "filler", text: "um, ", seconds: null },
    ];

    expect(toTranscriptParts(input)).toEqual([
      { type: "text", text: "So " },
      { type: "filler", text: "um, " },
    ]);
  });

  it("maps pause parts through with their seconds", () => {
    const input: ApiTranscriptPart[] = [{ type: "pause", text: null, seconds: 2.4 }];

    expect(toTranscriptParts(input)).toEqual([{ type: "pause", seconds: 2.4 }]);
  });

  it("falls back to an empty string for a null text field", () => {
    const input: ApiTranscriptPart[] = [{ type: "text", text: null, seconds: null }];

    expect(toTranscriptParts(input)).toEqual([{ type: "text", text: "" }]);
  });

  it("falls back to zero for a null seconds field", () => {
    const input: ApiTranscriptPart[] = [{ type: "pause", text: null, seconds: null }];

    expect(toTranscriptParts(input)).toEqual([{ type: "pause", seconds: 0 }]);
  });

  it("returns an empty array for an empty input", () => {
    expect(toTranscriptParts([])).toEqual([]);
  });
});
