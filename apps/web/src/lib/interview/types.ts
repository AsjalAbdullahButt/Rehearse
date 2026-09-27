// Mirrors apps/api/app/models/enums.py and apps/api/app/schemas/{question,session,feedback,
// transcription,answer,progress,profile}.py — the wire shapes the /api/* proxy routes forward
// verbatim. Despite the folder name, this covers the whole authenticated product domain
// (questions/sessions/answers/progress/profile), not just the recording flow specifically.

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

// Mirrors apps/api/app/models/profile.py's ANSWER_CAP_CHOICES — shared between the per-session
// override in SessionSetupForm and the persisted default in Settings.
export const TIME_CAP_OPTIONS = [60, 120, 180, 300] as const;

export type ExperienceLevel = "student" | "junior" | "mid" | "senior";

export const EXPERIENCE_LEVEL_OPTIONS: { slug: ExperienceLevel; name: string }[] = [
  { slug: "student", name: "Student / New grad" },
  { slug: "junior", name: "Junior" },
  { slug: "mid", name: "Mid-level" },
  { slug: "senior", name: "Senior" },
];

export type Focus = "behavioral" | "technical" | "situational" | "mixed";

export const FOCUS_OPTIONS: { slug: Focus; name: string }[] = [
  { slug: "behavioral", name: "Behavioral" },
  { slug: "technical", name: "Technical" },
  { slug: "situational", name: "Situational" },
  { slug: "mixed", name: "Mixed" },
];

// Mirrors apps/api/app/models/interview_session.py's QUESTION_COUNT_CHOICES.
export const QUESTION_COUNT_OPTIONS = [3, 5, 8] as const;

export type InterviewerStyle = "supportive" | "realistic" | "challenging";

export const INTERVIEWER_STYLE_OPTIONS: { slug: InterviewerStyle; name: string }[] = [
  { slug: "supportive", name: "Supportive" },
  { slug: "realistic", name: "Realistic" },
  { slug: "challenging", name: "Challenging" },
];

export type Category = "behavioral" | "technical" | "situational";
export type QuestionSource = "bank" | "generated" | "follow_up";
export type SessionStatus = "in_progress" | "completed";

export interface Question {
  id: string;
  role: Role;
  difficulty: Difficulty;
  category: Category;
  text: string;
}

export interface SessionQuestion {
  id: string;
  sequence_number: number;
  text: string;
  category: Category;
  source: QuestionSource;
}

export interface SessionCreateInput {
  role: Role;
  difficulty: Difficulty;
  experience_level: ExperienceLevel;
  focus: Focus;
  question_count: (typeof QUESTION_COUNT_OPTIONS)[number];
  answer_cap_s: (typeof TIME_CAP_OPTIONS)[number];
  company?: string;
  industry?: string;
  job_description?: string;
  candidate_background?: string;
  skills?: string[];
  focus_topics?: string[];
  years_experience?: number;
  interviewer_style?: InterviewerStyle;
  language?: string;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  role: Role;
  difficulty: Difficulty;
  experience_level: ExperienceLevel | null;
  focus: Focus;
  question_count: number;
  answer_cap_s: number;
  company: string | null;
  industry: string | null;
  interviewer_style: InterviewerStyle | null;
  language: string | null;
  status: SessionStatus;
  current_question_number: number;
  started_at: string;
  ended_at: string | null;
  current_question: SessionQuestion | null;
}

export interface AnswerCategoryBreakdown {
  category: Category;
  avg_star: number | null;
}

export interface SessionSummary {
  session: InterviewSession;
  questions_completed: number;
  overall_score: number | null;
  category_breakdown: AnswerCategoryBreakdown[];
  avg_wpm: number | null;
  avg_filler_count: number | null;
  avg_clarity: number | null;
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
  session_question_id: string | null;
  question_text: string;
  transcript: string;
  transcript_parts: ApiTranscriptPart[];
  duration_s: number;
  wpm: number;
  filler_count: number;
  filler_breakdown: Record<string, number>;
  long_pauses: number;
  rambling: string | null;
  confidence_note: string | null;
  feedback: LLMFeedback;
  created_at: string;
  question_number: number;
  question_count: number;
  session_status: SessionStatus;
  next_question: SessionQuestion | null;
}

export interface ProgressRow {
  session_id: string;
  role: string;
  difficulty: Difficulty;
  started_at: string;
  answer_count: number;
  avg_wpm: number | null;
  avg_filler_count: number | null;
  avg_clarity: number | null;
  avg_star: number | null;
}

export interface ProgressOut {
  sessions: ProgressRow[];
}

export interface Profile {
  display_name: string | null;
  target_role: string | null;
  answer_cap_s: number;
  voice_name: string | null;
  voice_rate: number;
}

export type ProfileUpdate = Partial<Profile>;
