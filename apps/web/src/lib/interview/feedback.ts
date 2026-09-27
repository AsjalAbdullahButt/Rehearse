import type { FeedbackReport } from "@/lib/interview/types";

/** Runtime guard for a report's feedback. The API's Pydantic schema requires every one of
 * these fields, but a page rendering a live network response shouldn't trust that contract
 * blindly — a version skew, a future backend change, or corrupted data could hand this a
 * null/partial `feedback` (or a null `feedback.rubric`), and the page should render a clear
 * "still processing" state instead of throwing on whichever property happens to be missing. */
export function hasCompleteFeedback(
  feedback: Partial<FeedbackReport> | null | undefined,
): feedback is FeedbackReport {
  return (
    feedback != null &&
    feedback.rubric != null &&
    typeof feedback.rubric.category === "string" &&
    typeof feedback.clarity === "number" &&
    typeof feedback.on_topic === "boolean" &&
    Array.isArray(feedback.strengths) &&
    Array.isArray(feedback.improvements) &&
    typeof feedback.follow_up_question === "string" &&
    // Exactly one of these two must be a real string, matching the API's own category-
    // conditioned validation (behavioral -> rewritten_answer, technical/situational ->
    // reference_answer) — see apps/api/app/schemas/feedback.py.
    (typeof feedback.rewritten_answer === "string" || typeof feedback.reference_answer === "string")
  );
}
