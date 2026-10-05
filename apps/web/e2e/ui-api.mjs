// Local, deterministic UI fixtures. Never used by the application or a deployed API.
import { createServer } from "node:http";

const profile = {
  display_name: "Practice Candidate",
  target_role: null,
  answer_cap_s: 120,
  voice_name: null,
  voice_rate: 1,
  candidate_background: null,
  skills: null,
  years_experience: null,
};
const question = {
  id: "question-1",
  sequence_number: 1,
  text: "Tell me about a time you resolved a conflict.",
  category: "behavioral",
  source: "bank",
};
const session = {
  id: "session-1",
  user_id: "ui-user",
  role: "backend",
  difficulty: "medium",
  experience_level: "mid",
  focus: "mixed",
  question_count: 3,
  answer_cap_s: 120,
  company: null,
  industry: null,
  interviewer_style: null,
  language: null,
  status: "in_progress",
  current_question_number: 1,
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  current_question: question,
};
const report = {
  id: "answer-1",
  session_id: session.id,
  category: "behavioral",
  question_text: question.text,
  question_number: 1,
  question_count: 3,
  session_status: "in_progress",
  next_question: { ...question, id: "question-2", sequence_number: 2 },
  transcript_parts: [
    {
      type: "text",
      text: "I listened to both perspectives and proposed a shared plan.",
      seconds: null,
    },
  ],
  filler_count: 2,
  wpm: 120,
  long_pauses: 1,
  word_count: 180,
  filler_rate_per_100_words: 1.1,
  max_pause_s: 2.5,
  avg_pause_s: 1.2,
  rambling: null,
  feedback: {
    rubric: { category: "behavioral", situation: 7, task: 7, action: 8, result: 6 },
    clarity: 8,
    on_topic: true,
    strengths: ["You explained your actions clearly."],
    improvements: ["Quantify the outcome of your shared plan."],
    evidence: ["I listened to both perspectives"],
    rambling_notes: "",
    rewritten_answer:
      "I listened to both perspectives, then proposed a shared plan that addressed their concerns.",
    reference_answer: null,
    missing_information: ["The outcome of the plan."],
    follow_up_question: "What would you do differently?",
  },
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3198");
  const send = (data, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  if (url.pathname === "/health") return send({ ok: true });
  if (!request.headers.authorization?.endsWith(".ui-fixture"))
    return send({ error: { code: "unauthorized" } }, 401);
  let body = "";
  for await (const chunk of request) body += chunk;
  if (url.pathname === "/v1/auth/me")
    return send({ id: "ui-user", email: "candidate@example.test" });
  if (url.pathname === "/v1/profile")
    return send(request.method === "PATCH" ? { ...profile, ...JSON.parse(body) } : profile);
  if (url.pathname === "/v1/sessions" && request.method === "POST") return send(session);
  if (url.pathname === "/v1/sessions" && request.method === "GET")
    return send([{ ...session, status: "completed", current_question: null }, session]);
  if (url.pathname === "/v1/mastery")
    return send({
      role: null,
      competencies: [
        ["sql", "SQL & Databases", 82, 4],
        ["caching", "Caching", 41, 3],
        ["security", "Security", 64, 2],
        ["testing", "Testing", 70, 1],
      ].map(([competency, name, mastery, attempts]) => ({
        role: "backend",
        competency,
        name,
        mastery,
        confidence: 60,
        questions_attempted: attempts,
        successful_attempts: Math.max(0, attempts - 1),
        highest_level: 3,
        last_practiced_at: "2026-09-28T10:00:00Z",
      })),
      strongest: "sql",
      weakest: "caching",
      needs_practice: ["caching"],
    });
  if (url.pathname === "/v1/readiness")
    return send({
      role: "backend",
      score: 68,
      coverage: 70,
      total_attempts: 10,
      categories: [{ category: "technical", score: 70 }],
      strongest: "sql",
      main_risk: "caching",
      drivers: [
        {
          competency: "caching",
          name: "Caching",
          weight: 1,
          mastery: 41,
          confidence: 60,
          attempts: 3,
          assessed: true,
          resume_evidence: "unknown",
        },
      ],
      explanation: ["Based on 10 answers covering 70% of this role's skill plan."],
    });
  if (url.pathname === "/v1/practice-plan")
    return send({
      role: "backend",
      today: [
        {
          competency: "caching",
          name: "Caching",
          mastery: 41,
          interval_days: 1,
          due_at: "2026-09-29T00:00:00",
          days_until_due: -1,
          is_due: true,
        },
      ],
      upcoming: [],
      question_count: 3,
      estimated_minutes: 9,
      focus_topics: ["caching"],
    });
  if (url.pathname.startsWith("/v1/sessions/"))
    return send({
      session,
      questions_completed: 1,
      overall_score: 7,
      category_breakdown: [{ category: "behavioral", avg_score: 7 }],
      avg_wpm: 120,
      avg_filler_count: 2,
      avg_clarity: 8,
      claims: [],
      panel_assessments: [],
    });
  if (url.pathname.endsWith("/attempts"))
    return send({
      attempts: [],
      overall_delta: null,
      components: [],
      improved: [],
      regressed: [],
      remained_weak: [],
      focus_next: null,
      filler_rate_delta: null,
      wpm_delta: null,
      summary: [],
    });
  if (url.pathname.endsWith("/shares")) return send([]);
  if (url.pathname.startsWith("/v1/answers/")) return send(report);
  if (url.pathname === "/v1/progress") {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return send({
      sessions: Array.from({ length: offset === 0 ? 20 : 1 }, (_, i) => ({
        session_id: `session-${offset + i + 1}`,
        role: "backend",
        difficulty: "medium",
        interview_mode: "technical_qa",
        status: "completed",
        question_count: 5,
        answer_cap_s: 120,
        focus: "mixed",
        company: null,
        role_title: null,
        total_answer_s: 90,
        started_at: new Date(Date.UTC(2026, 8, 30 - offset - i)).toISOString(),
        answer_count: 1,
        avg_wpm: 120,
        avg_filler_count: 2,
        avg_clarity: 8,
        avg_overall_score: 7,
        avg_filler_rate_per_100_words: 1.1,
        category_scores: { behavioral: 7 },
      })),
    });
  }
  return send({ error: { code: "not_found", message: "Fixture not found." } }, 404);
}).listen(3198, "127.0.0.1");
