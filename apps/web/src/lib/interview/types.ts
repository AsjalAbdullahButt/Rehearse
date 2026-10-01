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

/** Mirrors apps/api/app/core/languages.py — only languages the speech-to-text provider can
 * actually transcribe are offered. `speechTag` is the BCP-47 tag for the browser's
 * SpeechRecognition (captions) and SpeechSynthesis (read-aloud), both best-effort per browser. */
export const LANGUAGE_OPTIONS = [
  { code: "en", name: "English", speechTag: "en-US" },
  { code: "ur", name: "Urdu", speechTag: "ur-PK" },
  { code: "hi", name: "Hindi", speechTag: "hi-IN" },
  { code: "pa", name: "Punjabi", speechTag: "pa-IN" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

export function speechTagForLanguage(code: string | null | undefined): string {
  return LANGUAGE_OPTIONS.find((option) => option.code === code)?.speechTag ?? "en-US";
}

export type InterviewerStyle = "supportive" | "realistic" | "challenging";

export const INTERVIEWER_STYLE_OPTIONS: { slug: InterviewerStyle; name: string }[] = [
  { slug: "supportive", name: "Supportive" },
  { slug: "realistic", name: "Realistic" },
  { slug: "challenging", name: "Challenging" },
];

export type Category = "behavioral" | "technical" | "situational";
export type QuestionSource = "bank" | "generated" | "follow_up";
export type SessionStatus = "in_progress" | "completed" | "ended_early";

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
  /** What the adaptive interviewer was testing, and why it picked this question. Absent/null on
   * questions from before the adaptive engine existed. */
  competency?: string | null;
  level?: number | null;
  selection_reason?: string | null;
  /** Panel interviews only — who is asking (simulated interviewers). */
  panelist?: string | null;
  panelist_name?: string | null;
  panelist_title?: string | null;
}

/** What POST /v1/resume/parse returns — pre-fills SessionSetupForm's personalization fields, all
 * of which stay editable; nothing here is submitted automatically. Mirrors
 * apps/api/app/schemas/resume.py's ResumeExtraction. */
export interface ResumeExtraction {
  candidate_background: string | null;
  skills: string[];
  years_experience: number | null;
}

export interface SessionCreateInput {
  /** A preset role slug, or any free-text role ("AI Automation Engineer"). */
  role: string;
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
  panel?: boolean;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  /** Preset slug, or the slugified title of a custom role (see role_title). */
  role: string;
  role_title: string | null;
  job_target_id: string | null;
  panel: boolean;
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
  avg_score: number | null;
}

export interface SessionSummary {
  session: InterviewSession;
  questions_completed: number;
  overall_score: number | null;
  category_breakdown: AnswerCategoryBreakdown[];
  avg_wpm: number | null;
  avg_filler_count: number | null;
  avg_clarity: number | null;
  claims: Claim[];
  panel_assessments: PanelAssessment[];
}

/** Mirrors apps/api/app/schemas/claims.py. */
export interface Claim {
  id: string;
  claim_text: string;
  claim_type: string;
  importance: string;
  metric: string | null;
  source: string;
  status: string;
  note: string | null;
}

export interface PanelAssessment {
  panelist: string;
  name: string;
  title: string;
  label: string;
  questions: number;
  avg_score: number | null;
}

export interface ConsistencyNote {
  kind: string;
  answer_statement: string;
  resume_statement: string;
  message: string;
}

export interface Features {
  panel_interview: boolean;
  camera_coach: boolean;
}

export type DeliveryRating = "good" | "ok" | "needs_work" | "not_measured";

/** Mirrors apps/api/app/schemas/delivery.py. */
export interface DeliveryItem {
  key: string;
  label: string;
  rating: DeliveryRating;
  detail: string;
}

export interface DeliveryReport {
  items: DeliveryItem[];
  advice: string[];
  voice_measured: boolean;
}

export interface VisualDelivery {
  items: DeliveryItem[];
  advice: string[];
  disclaimer: string;
}

export interface ApiTranscriptPart {
  type: "text" | "filler" | "pause";
  text: string | null;
  seconds: number | null;
}

export interface BehavioralRubric {
  category: "behavioral";
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface TechnicalRubric {
  category: "technical";
  correctness: number;
  depth: number;
  tradeoffs: number;
  communication: number;
}

export interface SituationalRubric {
  category: "situational";
  problem_framing: number;
  prioritization: number;
  judgment: number;
  communication: number;
}

export type Rubric = BehavioralRubric | TechnicalRubric | SituationalRubric;

/** Mirrors apps/api/app/schemas/feedback.py's FeedbackReport — the permissive read-side shape
 * (not LLMFeedback's strict generation-time contract, which the web app never sees directly). */
export interface FeedbackReport {
  rubric: Rubric;
  clarity: number;
  on_topic: boolean;
  strengths: string[];
  improvements: string[];
  evidence: string[];
  rambling_notes: string;
  rewritten_answer: string | null;
  reference_answer: string | null;
  missing_information: string[];
  follow_up_question: string;
  consistency_notes?: ConsistencyNote[];
}

export interface AnswerReport {
  id: string;
  session_id: string;
  question_id: string | null;
  session_question_id: string | null;
  category: Category;
  question_text: string;
  transcript: string;
  transcript_parts: ApiTranscriptPart[];
  duration_s: number;
  wpm: number;
  word_count: number;
  filler_count: number;
  filler_breakdown: Record<string, number>;
  possible_filler_count: number;
  possible_filler_breakdown: Record<string, number>;
  filler_rate_per_100_words: number;
  long_pauses: number;
  max_pause_s: number | null;
  total_long_pause_s: number;
  avg_pause_s: number | null;
  rambling: string | null;
  confidence_note: string | null;
  transcription_quality_warning: string | null;
  feedback: FeedbackReport;
  created_at: string;
  question_number: number;
  question_count: number;
  session_status: SessionStatus;
  next_question: SessionQuestion | null;
  /** 1 for an original answer; >1 for a retry of `original_answer_id`. */
  attempt_number: number;
  original_answer_id: string | null;
  claims?: Claim[];
  delivery?: DeliveryReport | null;
  visual_delivery?: VisualDelivery | null;
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
  avg_overall_score: number | null;
  avg_filler_rate_per_100_words: number | null;
  category_scores: Partial<Record<Category, number>>;
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
  /** A saved "resume memory" (Settings) — pre-fills SessionSetupForm's matching personalization
   * fields on every new session, editable there like any other pre-fill, never auto-submitted. */
  candidate_background: string | null;
  skills: string[] | null;
  years_experience: number | null;
}

export type ProfileUpdate = Partial<Profile>;

/** Mirrors apps/api/app/schemas/attempts.py — every attempt at one question, compared. */
export interface AttemptOut {
  answer_id: string;
  attempt_number: number;
  transcript: string;
  created_at: string;
  overall_score: number | null;
  clarity: number | null;
  wpm: number;
  filler_rate_per_100_words: number;
  rubric: Record<string, number>;
}

export interface ComponentDelta {
  key: string;
  before: number;
  after: number;
  delta: number;
}

export interface AttemptComparison {
  attempts: AttemptOut[];
  overall_delta: number | null;
  components: ComponentDelta[];
  improved: string[];
  regressed: string[];
  remained_weak: string[];
  focus_next: string | null;
  filler_rate_delta: number | null;
  wpm_delta: number | null;
  summary: string[];
}

/** Mirrors apps/api/app/schemas/mastery.py and readiness.py. */
export interface CompetencyMastery {
  role: string;
  competency: string;
  name: string;
  mastery: number;
  confidence: number;
  questions_attempted: number;
  successful_attempts: number;
  highest_level: number;
  last_practiced_at: string | null;
}

export interface MasteryOut {
  role: string | null;
  competencies: CompetencyMastery[];
  strongest: string | null;
  weakest: string | null;
  needs_practice: string[];
}

export interface ReadinessDriver {
  competency: string;
  name: string;
  weight: number;
  mastery: number | null;
  confidence: number | null;
  attempts: number;
  assessed: boolean;
  resume_evidence: string;
}

/** The Rehearse Readiness Score: `score` is null when there isn't enough evidence, never a
 * guess, and it is not a percentile of other candidates. */
export interface ReadinessOut {
  role: string;
  score: number | null;
  coverage: number;
  total_attempts: number;
  categories: { category: Category; score: number }[];
  strongest: string | null;
  main_risk: string | null;
  drivers: ReadinessDriver[];
  explanation: string[];
}

export interface ScheduledSkill {
  competency: string;
  name: string;
  mastery: number;
  interval_days: number;
  due_at: string;
  days_until_due: number;
  is_due: boolean;
}

export interface PracticePlan {
  role: string | null;
  today: ScheduledSkill[];
  upcoming: ScheduledSkill[];
  question_count: number;
  estimated_minutes: number;
  focus_topics: string[];
}
