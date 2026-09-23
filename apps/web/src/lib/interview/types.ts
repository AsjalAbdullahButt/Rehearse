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
