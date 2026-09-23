import type { TranscriptPart } from "@/components/report/transcript-highlight";

import type { ApiTranscriptPart } from "./types";

/** Converts the API's flat wire shape (`{type, text, seconds}`, all optional except `type`)
 * into TranscriptHighlight's discriminated union. The API never sends a "text"-typed pause or
 * a "pause"-typed text, so the `?? ""` / `?? 0` fallbacks only matter if that contract is ever
 * violated — they keep this a total function either way. */
export function toTranscriptParts(parts: ApiTranscriptPart[]): TranscriptPart[] {
  return parts.map((part): TranscriptPart => {
    if (part.type === "pause") {
      return { type: "pause", seconds: part.seconds ?? 0 };
    }
    return { type: part.type, text: part.text ?? "" };
  });
}
