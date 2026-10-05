"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";

import { ResumeUpload } from "@/components/interview/resume-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionCard } from "@/components/ui/option-card";
import { OptionPill } from "@/components/ui/option-pill";
import { Stepper } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import {
  DIFFICULTY_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  FOCUS_OPTIONS,
  INTERVIEW_MODE_OPTIONS,
  INTERVIEWER_STYLE_OPTIONS,
  LANGUAGE_OPTIONS,
  QUESTION_COUNT_OPTIONS,
  ROLE_OPTIONS,
  TIME_CAP_OPTIONS,
} from "@/lib/interview/types";
import type {
  Difficulty,
  ExperienceLevel,
  Focus,
  InterviewMode,
  InterviewerStyle,
  LanguageCode,
  ResumeExtraction,
  Role,
  SessionCreateInput,
} from "@/lib/interview/types";

const MAX_ROLE_LENGTH = 80;
const MAX_COMPANY_LENGTH = 120;
const MAX_INDUSTRY_LENGTH = 120;
const MAX_JOB_DESCRIPTION_LENGTH = 12_000;
const MAX_CANDIDATE_BACKGROUND_LENGTH = 8_000;
const MAX_FOCUS_TOPICS = 10;

const STEPS = [
  { id: "resume", label: "Resume" },
  { id: "job", label: "Job" },
  { id: "interview", label: "Interview" },
  { id: "preferences", label: "Preferences" },
  { id: "review", label: "Review" },
] as const;
const STEP_RESUME = 0;
const STEP_JOB = 1;
const STEP_INTERVIEW = 2;
const STEP_PREFERENCES = 3;
const STEP_REVIEW = 4;

const MODE_DESCRIPTIONS: Record<InterviewMode, string> = {
  technical_qa: "Questions on your technical knowledge, reasoning and problem-solving.",
  coding: "Talk through how you would solve coding problems, out loud.",
  system_design: "Design a system end to end and defend the trade-offs.",
  case_study: "Work through a realistic business or product scenario.",
};

const FOCUS_DESCRIPTIONS: Record<Focus, string> = {
  behavioral: "Past experiences: teamwork, conflict, ownership.",
  technical: "Role-specific knowledge and reasoning.",
  situational: "How you would handle realistic what-if scenarios.",
  mixed: "A balance of all three, like a real interview loop.",
};

function splitList(value: string, max: number): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

const DEFAULT_ANSWER_CAP_S: (typeof TIME_CAP_OPTIONS)[number] = 120;
const DEFAULT_QUESTION_COUNT: (typeof QUESTION_COUNT_OPTIONS)[number] = 5;

function isTimeCapOption(value: number | undefined): value is (typeof TIME_CAP_OPTIONS)[number] {
  return (TIME_CAP_OPTIONS as readonly number[]).includes(value ?? Number.NaN);
}

function isQuestionCountOption(
  value: number | undefined,
): value is (typeof QUESTION_COUNT_OPTIONS)[number] {
  return (QUESTION_COUNT_OPTIONS as readonly number[]).includes(value ?? Number.NaN);
}

function defaultFocusForMode(mode: InterviewMode): Focus {
  if (mode === "case_study") return "situational";
  return mode === "technical_qa" ? "mixed" : "technical";
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { id: string; hintId: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-text text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-muted -mt-1 text-xs">
          {hint}
        </p>
      ) : null}
      {children({ id, hintId: hint ? hintId : undefined })}
    </div>
  );
}

function ChoiceGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-text mb-3 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-muted text-xs">{label}</dt>
        <dd className="text-text text-sm break-words">{value}</dd>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}>
        Edit
      </Button>
    </div>
  );
}

export function SessionSetupForm({
  initialRole,
  panelAvailable = false,
  initialCustomRole,
  initialFocusTopics,
  initialFocus,
  initialDifficulty,
  initialQuestionCount,
  initialAnswerCapS,
  initialCandidateBackground,
  initialSkills,
  initialYearsExperience,
  isSubmitting,
  error,
  onSubmit,
}: {
  initialRole?: Role;
  /** Shows the panel-interview option (only when the API's feature flag is on). */
  panelAvailable?: boolean;
  /** A role that isn't a preset (e.g. from a practice-plan link for a custom role). */
  initialCustomRole?: string;
  /** Pre-fills the focus-topics field (e.g. today's spaced-repetition skills). */
  initialFocusTopics?: string[];
  /** A session-focused link (e.g. "Practice this weak area" on the summary page) can hand a
   * specific focus straight through instead of leaving the candidate to reselect "Mixed" and
   * then a category by hand. */
  initialFocus?: Focus;
  /** Set by a "repeat this setup" link (session summary page) — restores the previous session's
   * exact configuration instead of resetting to the defaults below. */
  initialDifficulty?: Difficulty;
  initialQuestionCount?: number;
  /** The candidate's saved default from Settings — pre-fills the time cap instead of always
   * starting at 120s regardless of what they configured there. A "repeat this setup" link can
   * override it with the exact cap that session used. */
  initialAnswerCapS?: number;
  /** The candidate's saved "resume memory" from Settings (uploaded once, reused every session
   * from then on) — pre-fills the same personalization fields a fresh per-session resume
   * upload would, editable here like any other pre-fill. A fresh upload in *this* session
   * (see handleResumeExtracted) still overwrites these, the same as it would overwrite anything
   * typed by hand. */
  initialCandidateBackground?: string | null;
  initialSkills?: string[] | null;
  initialYearsExperience?: number | null;
  isSubmitting: boolean;
  error?: string | null;
  onSubmit: (value: SessionCreateInput) => void;
}) {
  const [step, setStep] = useState(STEP_RESUME);
  const [triedJobNext, setTriedJobNext] = useState(false);
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [customRole, setCustomRole] = useState(initialCustomRole ?? "");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [panel, setPanel] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? "medium");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [focus, setFocus] = useState<Focus>(initialFocus ?? "mixed");
  const [interviewMode, setInterviewMode] = useState<InterviewMode>("technical_qa");
  const [focusWasChosen, setFocusWasChosen] = useState(Boolean(initialFocus));
  const [questionCount, setQuestionCount] = useState<(typeof QUESTION_COUNT_OPTIONS)[number]>(
    isQuestionCountOption(initialQuestionCount) ? initialQuestionCount : DEFAULT_QUESTION_COUNT,
  );
  const [answerCapS, setAnswerCapS] = useState<(typeof TIME_CAP_OPTIONS)[number]>(
    isTimeCapOption(initialAnswerCapS) ? initialAnswerCapS : DEFAULT_ANSWER_CAP_S,
  );
  const [yearsError, setYearsError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const hasSavedResumeMemory = Boolean(
    initialCandidateBackground || initialSkills?.length || initialYearsExperience,
  );
  const [industry, setIndustry] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [candidateBackground, setCandidateBackground] = useState(initialCandidateBackground ?? "");
  const [skills, setSkills] = useState(initialSkills?.join(", ") ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    initialYearsExperience != null ? String(initialYearsExperience) : "",
  );
  const [focusTopics, setFocusTopics] = useState(initialFocusTopics?.join(", ") ?? "");
  const [interviewerStyle, setInterviewerStyle] = useState<InterviewerStyle | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const roleValue = customRole.trim() || role;
  const roleName = customRole.trim() || ROLE_OPTIONS.find((o) => o.slug === role)?.name || "";

  function handleResumeExtracted(extraction: ResumeExtraction) {
    if (extraction.candidate_background) setCandidateBackground(extraction.candidate_background);
    if (extraction.skills.length > 0) setSkills(extraction.skills.join(", "));
    if (extraction.years_experience !== null) {
      setYearsExperience(String(extraction.years_experience));
    }
  }

  function parseYears(): number | null | "invalid" {
    if (yearsExperience === "") return null;
    const parsed = Number(yearsExperience);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 80 ? parsed : "invalid";
  }

  function goTo(index: number) {
    setStep(index);
    // Move focus to the new step's heading so keyboard/screen-reader users land on it.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function handleNext() {
    if (step === STEP_JOB) {
      setTriedJobNext(true);
      if (!roleValue) return;
      if (parseYears() === "invalid") {
        setYearsError("Enter a whole number of years between 0 and 80.");
        return;
      }
      setYearsError(null);
    }
    goTo(Math.min(step + 1, STEP_REVIEW));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter inside a text field must advance the wizard, never start the interview early.
    if (step !== STEP_REVIEW) {
      handleNext();
      return;
    }
    if (!roleValue) {
      goTo(STEP_JOB);
      setTriedJobNext(true);
      return;
    }
    const years = parseYears();
    if (years === "invalid") {
      setYearsError("Enter a whole number of years between 0 and 80.");
      goTo(STEP_JOB);
      return;
    }
    onSubmit({
      role: roleValue,
      language,
      panel: panel || undefined,
      difficulty,
      experience_level: experienceLevel,
      focus,
      interview_mode: interviewMode,
      question_count: questionCount,
      answer_cap_s: answerCapS,
      company: company.trim() || undefined,
      industry: industry.trim() || undefined,
      job_description: jobDescription.trim() || undefined,
      candidate_background: candidateBackground.trim() || undefined,
      skills: skills.trim() ? splitList(skills, 20) : undefined,
      years_experience: years ?? undefined,
      focus_topics: focusTopics.trim() ? splitList(focusTopics, MAX_FOCUS_TOPICS) : undefined,
      interviewer_style: interviewerStyle ?? undefined,
    });
  }

  const showRoleError = triedJobNext && !roleValue;
  const modeName = INTERVIEW_MODE_OPTIONS.find((o) => o.slug === interviewMode)?.name ?? "";
  const focusName = FOCUS_OPTIONS.find((o) => o.slug === focus)?.name ?? "";
  const difficultyName = DIFFICULTY_OPTIONS.find((o) => o.slug === difficulty)?.name ?? "";
  const experienceName = EXPERIENCE_LEVEL_OPTIONS.find((o) => o.slug === experienceLevel)?.name;
  const languageName = LANGUAGE_OPTIONS.find((o) => o.code === language)?.name ?? "";
  const capLabel = answerCapS >= 60 ? `${answerCapS / 60} min` : `${answerCapS}s`;
  const maxMinutes = (questionCount * answerCapS) / 60;

  const stepTitle: Record<number, { title: string; description: string }> = {
    [STEP_RESUME]: {
      title: "Start with your resume",
      description:
        "Optional. Upload it and we’ll tailor the questions to your experience. You can skip this.",
    },
    [STEP_JOB]: {
      title: "What role are you preparing for?",
      description: "Choose a role. Adding the company or job description makes questions sharper.",
    },
    [STEP_INTERVIEW]: {
      title: "What kind of interview?",
      description: "Pick the style of questions you want to practise.",
    },
    [STEP_PREFERENCES]: {
      title: "Difficulty and preferences",
      description: "Tune how hard, how long and in which language.",
    },
    [STEP_REVIEW]: {
      title: "Review and start",
      description: "Check everything looks right. You can edit any section before starting.",
    },
  };
  const current = stepTitle[step];

  return (
    <Card className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Stepper steps={STEPS} current={step} onSelect={goTo} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <fieldset disabled={isSubmitting} className="contents">
          <div className="flex flex-col gap-2">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-text text-2xl font-bold outline-none"
            >
              {current?.title}
            </h1>
            <p className="text-muted text-sm">{current?.description}</p>
          </div>

          {/* Every step stays mounted (just hidden) so Back never loses typed or uploaded input. */}
          <div hidden={step !== STEP_RESUME} className="flex flex-col gap-4">
            <ResumeUpload onExtracted={handleResumeExtracted} />
            {hasSavedResumeMemory ? (
              <p className="text-muted text-xs">
                Using the background, skills, and experience saved in your{" "}
                <a href="/settings" className="text-lime hover:underline">
                  Settings
                </a>
                . Upload a different resume above to change it for this session only.
              </p>
            ) : null}
          </div>

          <div hidden={step !== STEP_JOB}>
            <div className="flex flex-col gap-6">
              <ChoiceGroup legend="Role">
                {ROLE_OPTIONS.map((option) => (
                  <OptionPill
                    name="role"
                    key={option.slug}
                    value={option.slug}
                    label={option.name}
                    selected={!customRole.trim() && role === option.slug}
                    onSelect={(slug) => {
                      setCustomRole("");
                      setRole(slug);
                    }}
                  />
                ))}
              </ChoiceGroup>
              <Field
                label="Or a different role"
                hint="We’ll build a question plan for any role you type."
              >
                {({ id, hintId }) => (
                  <Input
                    id={id}
                    value={customRole}
                    onChange={(event) => setCustomRole(event.target.value)}
                    maxLength={MAX_ROLE_LENGTH}
                    placeholder="e.g. DevOps Engineer"
                    aria-describedby={hintId}
                  />
                )}
              </Field>
              {showRoleError ? (
                <p role="alert" className="text-coral text-sm">
                  Choose a role, or type one, to continue.
                </p>
              ) : null}

              <Field label="Target company (optional)">
                {({ id }) => (
                  <Input
                    id={id}
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    maxLength={MAX_COMPANY_LENGTH}
                    placeholder="e.g. Acme Corp"
                  />
                )}
              </Field>
              <Field label="Industry (optional)">
                {({ id }) => (
                  <Input
                    id={id}
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    maxLength={MAX_INDUSTRY_LENGTH}
                    placeholder="e.g. Fintech"
                  />
                )}
              </Field>
              <Field
                label="Job description (optional)"
                hint="Paste the posting you are preparing for."
              >
                {({ id, hintId }) => (
                  <>
                    <Textarea
                      id={id}
                      value={jobDescription}
                      onChange={(event) => setJobDescription(event.target.value)}
                      maxLength={MAX_JOB_DESCRIPTION_LENGTH}
                      rows={7}
                      aria-describedby={hintId}
                    />
                    <p className="text-muted text-right text-xs tabular-nums">
                      {jobDescription.length.toLocaleString()} /{" "}
                      {MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()}
                    </p>
                  </>
                )}
              </Field>

              <details
                className="border-line rounded-[var(--radius-tile)] border p-4"
                open={hasSavedResumeMemory}
              >
                <summary className="text-text cursor-pointer text-sm font-medium">
                  About you (optional)
                </summary>
                <div className="mt-4 flex flex-col gap-5">
                  <Field label="Your background">
                    {({ id }) => (
                      <Textarea
                        id={id}
                        value={candidateBackground}
                        onChange={(event) => setCandidateBackground(event.target.value)}
                        maxLength={MAX_CANDIDATE_BACKGROUND_LENGTH}
                        rows={5}
                        placeholder="A short summary of your experience so far."
                      />
                    )}
                  </Field>
                  <Field label="Primary skills" hint="Separate with commas.">
                    {({ id, hintId }) => (
                      <Input
                        id={id}
                        value={skills}
                        onChange={(event) => setSkills(event.target.value)}
                        placeholder="e.g. Python, React, SQL"
                        aria-describedby={hintId}
                      />
                    )}
                  </Field>
                  <Field label="Years of experience">
                    {({ id }) => (
                      <>
                        <Input
                          id={id}
                          type="number"
                          min={0}
                          max={80}
                          value={yearsExperience}
                          onChange={(event) => {
                            setYearsExperience(event.target.value);
                            setYearsError(null);
                          }}
                          placeholder="e.g. 5"
                          aria-invalid={yearsError ? true : undefined}
                        />
                        {yearsError ? (
                          <p role="alert" className="text-coral text-sm">
                            {yearsError}
                          </p>
                        ) : null}
                      </>
                    )}
                  </Field>
                  <Field
                    label="Focus topics"
                    hint={`Separate with commas, up to ${MAX_FOCUS_TOPICS}.`}
                  >
                    {({ id, hintId }) => (
                      <Input
                        id={id}
                        value={focusTopics}
                        onChange={(event) => setFocusTopics(event.target.value)}
                        placeholder="e.g. system design, caching"
                        aria-describedby={hintId}
                      />
                    )}
                  </Field>
                </div>
              </details>
            </div>
          </div>

          <div hidden={step !== STEP_INTERVIEW}>
            <div className="flex flex-col gap-6">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-text mb-3 text-sm font-medium">Interview mode</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INTERVIEW_MODE_OPTIONS.map((option) => (
                    <OptionCard
                      name="interview-mode"
                      key={option.slug}
                      value={option.slug}
                      label={option.name}
                      description={MODE_DESCRIPTIONS[option.slug]}
                      selected={interviewMode === option.slug}
                      onSelect={(value) => {
                        setInterviewMode(value);
                        if (!focusWasChosen) setFocus(defaultFocusForMode(value));
                      }}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-text mb-3 text-sm font-medium">Question focus</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FOCUS_OPTIONS.map((option) => (
                    <OptionCard
                      name="focus"
                      key={option.slug}
                      value={option.slug}
                      label={option.name}
                      description={FOCUS_DESCRIPTIONS[option.slug]}
                      selected={focus === option.slug}
                      onSelect={(value) => {
                        setFocusWasChosen(true);
                        setFocus(value);
                      }}
                    />
                  ))}
                </div>
              </fieldset>

              <ChoiceGroup legend="Interviewer style">
                {INTERVIEWER_STYLE_OPTIONS.map((option) => (
                  <OptionPill
                    name="style"
                    key={option.slug}
                    value={option.slug}
                    label={option.name}
                    selected={interviewerStyle === option.slug}
                    onSelect={setInterviewerStyle}
                  />
                ))}
              </ChoiceGroup>

              {panelAvailable ? (
                <label className="border-line flex items-start gap-3 rounded-[var(--radius-tile)] border p-4">
                  <input
                    type="checkbox"
                    checked={panel}
                    onChange={(event) => setPanel(event.target.checked)}
                    className="mt-1 size-4"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-text text-sm font-medium">Panel interview</span>
                    <span className="text-muted text-xs">
                      A simulated recruiter, technical lead and engineering manager take turns, each
                      asking about their own area. Your report scores each of them separately.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <div hidden={step !== STEP_PREFERENCES}>
            <div className="flex flex-col gap-6">
              <ChoiceGroup legend="Experience level">
                {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                  <OptionPill
                    name="experience"
                    key={option.slug}
                    value={option.slug}
                    label={option.name}
                    selected={experienceLevel === option.slug}
                    onSelect={setExperienceLevel}
                  />
                ))}
              </ChoiceGroup>
              <ChoiceGroup legend="Difficulty">
                {DIFFICULTY_OPTIONS.map((option) => (
                  <OptionPill
                    name="difficulty"
                    key={option.slug}
                    value={option.slug}
                    label={option.name}
                    selected={difficulty === option.slug}
                    onSelect={setDifficulty}
                  />
                ))}
              </ChoiceGroup>
              <ChoiceGroup legend="Number of questions">
                {QUESTION_COUNT_OPTIONS.map((count) => (
                  <OptionPill
                    name="count"
                    key={count}
                    value={count.toString()}
                    label={`${count}`}
                    selected={questionCount === count}
                    onSelect={() => setQuestionCount(count)}
                  />
                ))}
              </ChoiceGroup>
              <ChoiceGroup legend="Answer time limit">
                {TIME_CAP_OPTIONS.map((seconds) => (
                  <OptionPill
                    name="cap"
                    key={seconds}
                    value={seconds.toString()}
                    label={seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`}
                    selected={answerCapS === seconds}
                    onSelect={() => setAnswerCapS(seconds)}
                  />
                ))}
              </ChoiceGroup>
              <ChoiceGroup legend="Interview language">
                {LANGUAGE_OPTIONS.map((option) => (
                  <OptionPill
                    name="language"
                    key={option.code}
                    value={option.code}
                    label={option.name}
                    selected={language === option.code}
                    onSelect={setLanguage}
                  />
                ))}
              </ChoiceGroup>
            </div>
          </div>

          <div hidden={step !== STEP_REVIEW}>
            <dl className="divide-line divide-y">
              <ReviewRow
                label="Role"
                value={roleName || "Not chosen yet"}
                onEdit={() => goTo(STEP_JOB)}
              />
              {company.trim() ? (
                <ReviewRow label="Company" value={company.trim()} onEdit={() => goTo(STEP_JOB)} />
              ) : null}
              <ReviewRow
                label="Interview"
                value={`${modeName} · ${focusName} focus${panel ? " · Panel" : ""}${
                  interviewerStyle ? ` · ${interviewerStyle} interviewer` : ""
                }`}
                onEdit={() => goTo(STEP_INTERVIEW)}
              />
              <ReviewRow
                label="Difficulty"
                value={`${difficultyName}${experienceName ? ` · ${experienceName}` : ""}`}
                onEdit={() => goTo(STEP_PREFERENCES)}
              />
              <ReviewRow
                label="Questions"
                value={`${questionCount} questions · ${capLabel} per answer · ${languageName}`}
                onEdit={() => goTo(STEP_PREFERENCES)}
              />
              <ReviewRow
                label="Context"
                value={
                  [
                    jobDescription.trim() ? "Job description" : null,
                    candidateBackground.trim() || skills.trim() ? "Your background" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "None added — questions will use role defaults"
                }
                onEdit={() => goTo(STEP_RESUME)}
              />
            </dl>
            <p className="text-muted mt-4 text-sm">
              Answers take up to {maxMinutes} minutes in total, plus a few seconds of feedback after
              each one.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-coral text-sm">
              {error}
            </p>
          ) : null}

          <div className="bg-surface border-line sticky bottom-0 -mx-6 flex flex-col-reverse gap-3 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:px-0 sm:py-0">
            <Button
              variant="ghost"
              disabled={step === STEP_RESUME}
              onClick={() => goTo(Math.max(step - 1, STEP_RESUME))}
            >
              Back
            </Button>
            {step === STEP_REVIEW ? (
              <Button type="submit" size="lg" loading={isSubmitting} disabled={!roleValue}>
                {isSubmitting ? "Preparing interview…" : "Start interview"}
              </Button>
            ) : (
              <Button size="lg" onClick={handleNext}>
                {step === STEP_RESUME ? "Continue" : "Next"}
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
