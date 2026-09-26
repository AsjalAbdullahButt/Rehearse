import type { LLMFeedback } from "@/lib/interview/types";

/** Runtime guard for a report's feedback. The API's Pydantic schema requires every one of
 * these fields, but a page rendering a live network response shouldn't trust that contract
 * blindly — a version skew, a future backend change, or corrupted data could hand this a
 * null/partial `feedback` (or a null `feedback.star`), and the page should render a clear
 * "still processing" state instead of throwing on whichever property happens to be missing. */
export function hasCompleteFeedback(
  feedback: Partial<LLMFeedback> | null | undefined,
): feedback is LLMFeedback {
  return (
    feedback != null &&
    feedback.star != null &&
    typeof feedback.star.situation === "number" &&
    typeof feedback.star.task === "number" &&
    typeof feedback.star.action === "number" &&
    typeof feedback.star.result === "number" &&
    typeof feedback.clarity === "number" &&
    typeof feedback.on_topic === "boolean" &&
    Array.isArray(feedback.tips) &&
    typeof feedback.sample_answer === "string" &&
    typeof feedback.follow_up_question === "string"
  );
}
