// Mirrors apps/api/app/models/enums.py and apps/api/app/schemas/{question,session,feedback,
// transcription,answer}.py — the wire shapes the interview proxy routes forward verbatim.

export type Role =
  | "software-engineer"
  | "frontend"
  | "backend"
  | "data-scientist"
  | "ml-engineer"
  | "product-manager"
  | "ui-ux-designer"
  | "hr-general";

export type Difficulty = "easy" | "medium" | "hard";

// Shared between the landing page's Roles grid and the interview role picker, so the two
// never drift out of sync on labels or slugs.
export const ROLE_OPTIONS: { slug: Role; name: string }[] = [
  { slug: "software-engineer", name: "Software Engineer" },
  { slug: "frontend", name: "Frontend" },
  { slug: "backend", name: "Backend" },
  { slug: "data-scientist", name: "Data Scientist" },
  { slug: "ml-engineer", name: "ML Engineer" },
  { slug: "product-manager", name: "Product Manager" },
  { slug: "ui-ux-designer", name: "UI/UX Designer" },
  { slug: "hr-general", name: "HR / General" },
];

export const DIFFICULTY_OPTIONS: { slug: Difficulty; name: string }[] = [
  { slug: "easy", name: "Easy" },
  { slug: "medium", name: "Medium" },
  { slug: "hard", name: "Hard" },
];

export interface Question {
  id: string;
  role: Role;
  difficulty: Difficulty;
  category: "behavioral" | "technical" | "situational";
  text: string;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  role: string;
  difficulty: Difficulty;
  started_at: string;
  ended_at: string | null;
}

export interface ApiTranscriptPart {
  type: "text" | "filler" | "pause";
  text: string | null;
  seconds: number | null;
}

export interface StarScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface LLMFeedback {
  star: StarScores;
  clarity: number;
  on_topic: boolean;
  rambling_notes: string;
  tips: string[];
  sample_answer: string;
  follow_up_question: string;
}

export interface AnswerReport {
  id: string;
  session_id: string;
  question_id: string | null;
  question_text: string;
  transcript: string;
  transcript_parts: ApiTranscriptPart[];
  duration_s: number;
  wpm: number;
  filler_count: number;
  filler_breakdown: Record<string, number>;
  long_pauses: number;
  rambling: string | null;
  feedback: LLMFeedback;
  created_at: string;
}
