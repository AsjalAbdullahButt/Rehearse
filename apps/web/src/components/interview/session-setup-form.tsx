"use client";

import { type FormEvent, useState } from "react";

import { ResumeUpload } from "@/components/interview/resume-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionPill } from "@/components/ui/option-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  DIFFICULTY_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  FOCUS_OPTIONS,
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
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [customRole, setCustomRole] = useState(initialCustomRole ?? "");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [panel, setPanel] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? "medium");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [focus, setFocus] = useState<Focus>(initialFocus ?? "mixed");
  const [questionCount, setQuestionCount] = useState<(typeof QUESTION_COUNT_OPTIONS)[number]>(
    isQuestionCountOption(initialQuestionCount) ? initialQuestionCount : DEFAULT_QUESTION_COUNT,
  );
  const [answerCapS, setAnswerCapS] = useState<(typeof TIME_CAP_OPTIONS)[number]>(
    isTimeCapOption(initialAnswerCapS) ? initialAnswerCapS : DEFAULT_ANSWER_CAP_S,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const hasSavedResumeMemory = Boolean(
    initialCandidateBackground || initialSkills?.length || initialYearsExperience,
  );
  const [showPersonalize, setShowPersonalize] = useState(
    hasSavedResumeMemory || Boolean(initialFocusTopics?.length),
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

  function handleResumeExtracted(extraction: ResumeExtraction) {
    setShowPersonalize(true);
    if (extraction.candidate_background) setCandidateBackground(extraction.candidate_background);
    if (extraction.skills.length > 0) setSkills(extraction.skills.join(", "));
    if (extraction.years_experience !== null) {
      setYearsExperience(String(extraction.years_experience));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roleValue = customRole.trim() || role;
    if (!roleValue) return;
    const parsedYearsExperience = yearsExperience === "" ? Number.NaN : Number(yearsExperience);
    if (
      yearsExperience !== "" &&
      (!Number.isInteger(parsedYearsExperience) ||
        parsedYearsExperience < 0 ||
        parsedYearsExperience > 80)
    ) {
      setValidationError("Enter a whole number of years between 0 and 80.");
      setShowPersonalize(true);
      return;
    }
    setValidationError(null);
    onSubmit({
      role: roleValue,
      language,
      panel: panel || undefined,
      difficulty,
      experience_level: experienceLevel,
      focus,
      question_count: questionCount,
      answer_cap_s: answerCapS,
      company: company.trim() || undefined,
      industry: industry.trim() || undefined,
      job_description: jobDescription.trim() || undefined,
      candidate_background: candidateBackground.trim() || undefined,
      skills: skills.trim() ? splitList(skills, 20) : undefined,
      years_experience: Number.isFinite(parsedYearsExperience) ? parsedYearsExperience : undefined,
      focus_topics: focusTopics.trim() ? splitList(focusTopics, MAX_FOCUS_TOPICS) : undefined,
      interviewer_style: interviewerStyle ?? undefined,
    });
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <fieldset disabled={isSubmitting} className="contents">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-text text-2xl font-bold">Start a mock interview</h1>
            <p className="text-muted text-sm">
              Choose your role and start with the defaults, or tailor your session below.
            </p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
              Role
            </legend>
            <div className="flex flex-wrap gap-2">
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
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-muted text-xs">
                Or interview for any other role — we&apos;ll build the question plan for it
              </span>
              <Input
                value={customRole}
                onChange={(event) => setCustomRole(event.target.value)}
                maxLength={MAX_ROLE_LENGTH}
                placeholder="e.g. DevOps Engineer"
                aria-label="Custom role"
              />
            </label>
          </fieldset>

          <details className="border-line rounded-[var(--radius-tile)] border p-4">
            <summary className="text-text cursor-pointer text-sm font-medium">
              Session options: {questionCount} questions, {answerCapS / 60} min per answer
            </summary>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Experience level
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Interview focus
                </legend>
                <div className="flex flex-wrap gap-2">
                  {FOCUS_OPTIONS.map((option) => (
                    <OptionPill
                      name="focus"
                      key={option.slug}
                      value={option.slug}
                      label={option.name}
                      selected={focus === option.slug}
                      onSelect={setFocus}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Difficulty
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Number of questions
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Answer time cap
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>

              {panelAvailable ? (
                <label className="border-line flex items-start gap-3 rounded-[var(--radius-tile)] border p-3 sm:col-span-2">
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

              <fieldset className="flex flex-col gap-3">
                <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Interview language
                </legend>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </fieldset>
            </div>
          </details>
          <div className="border-line flex flex-col gap-4 border-t pt-6">
            <button
              type="button"
              onClick={() => setShowPersonalize((value) => !value)}
              className="text-text text-left text-sm font-medium"
              aria-expanded={showPersonalize}
              aria-controls="personalization"
            >
              {showPersonalize ? "− Hide personalization" : "+ Personalize further (optional)"}
            </button>

            {showPersonalize ? (
              <div id="personalization" className="flex flex-col gap-4">
                <ResumeUpload onExtracted={handleResumeExtracted} />
                {hasSavedResumeMemory ? (
                  <p className="text-muted -mt-4 text-xs">
                    Using the background, skills, and experience saved in your{" "}
                    <a href="/settings" className="text-lime hover:underline">
                      Settings
                    </a>
                    . Upload a different resume above, or edit the fields below, to change it for
                    this session only.
                  </p>
                ) : null}

                <label className="flex flex-col gap-3">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Target company (optional)
                  </span>
                  <Input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    maxLength={MAX_COMPANY_LENGTH}
                    placeholder="e.g. Acme Corp"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Industry
                  </span>
                  <Input
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    maxLength={MAX_INDUSTRY_LENGTH}
                    placeholder="e.g. Fintech"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Job description
                  </span>
                  <Textarea
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    maxLength={MAX_JOB_DESCRIPTION_LENGTH}
                    placeholder="Paste the job description you're preparing for."
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Your background
                  </span>
                  <Textarea
                    value={candidateBackground}
                    onChange={(event) => setCandidateBackground(event.target.value)}
                    maxLength={MAX_CANDIDATE_BACKGROUND_LENGTH}
                    placeholder="A short summary of your experience so far."
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Primary skills (comma-separated)
                  </span>
                  <Input
                    value={skills}
                    onChange={(event) => setSkills(event.target.value)}
                    placeholder="e.g. Python, React, SQL"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Years of experience
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={80}
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value)}
                    placeholder="e.g. 5"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium tracking-wide uppercase">
                    Focus topics (comma-separated, up to {MAX_FOCUS_TOPICS})
                  </span>
                  <Input
                    value={focusTopics}
                    onChange={(event) => setFocusTopics(event.target.value)}
                    placeholder="e.g. system design, caching"
                  />
                </label>

                <fieldset className="flex flex-col gap-3">
                  <legend className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                    Interviewer style
                  </legend>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </fieldset>
              </div>
            ) : null}
          </div>

          {validationError ? (
            <p role="alert" className="text-coral text-sm">
              {validationError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-coral text-sm">
              {error}
            </p>
          ) : null}
          <div className="bg-surface border-line flex flex-col gap-3 border-t py-4">
            <p className="text-muted text-sm">
              {questionCount} questions · up to {(questionCount * answerCapS) / 60} minutes of
              answers, plus feedback time.
            </p>
            {!role && !customRole.trim() ? (
              <p className="text-muted text-xs">Choose a role to begin.</p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              disabled={(!role && !customRole.trim()) || isSubmitting}
            >
              {isSubmitting ? "Preparing your question…" : "Start"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
