import { InterviewFlow } from "@/components/interview/interview-flow";
import { fetchFeatures, fetchProfile } from "@/lib/interview/server";
import {
  DIFFICULTY_OPTIONS,
  FOCUS_OPTIONS,
  QUESTION_COUNT_OPTIONS,
  ROLE_OPTIONS,
  TIME_CAP_OPTIONS,
  type Difficulty,
  type Focus,
  type Role,
} from "@/lib/interview/types";

function toValidRole(value: string | undefined): Role | undefined {
  return ROLE_OPTIONS.find((option) => option.slug === value)?.slug;
}

/** A non-preset role slug from a link (a custom role's stored key, e.g. "devops-engineer") shown
 * as an editable title. Anything that isn't plain words is ignored rather than trusted. */
function toCustomRole(value: string | undefined): string | undefined {
  if (!value || toValidRole(value) || value.length > 80 || !/^[\w-]+$/.test(value)) {
    return undefined;
  }
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toTopics(value: string | undefined): string[] | undefined {
  const topics = (value ?? "")
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0 && topic.length <= 60 && /^[\w &/+.#-]+$/.test(topic))
    .slice(0, 10);
  return topics.length > 0 ? topics : undefined;
}

function toValidFocus(value: string | undefined): Focus | undefined {
  return FOCUS_OPTIONS.find((option) => option.slug === value)?.slug;
}

function toValidDifficulty(value: string | undefined): Difficulty | undefined {
  return DIFFICULTY_OPTIONS.find((option) => option.slug === value)?.slug;
}

function toValidNumberOption(
  value: string | undefined,
  options: readonly number[],
): number | undefined {
  const parsed = Number(value);
  return options.includes(parsed) ? parsed : undefined;
}

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    session?: string;
    focus?: string;
    difficulty?: string;
    count?: string;
    cap?: string;
    topics?: string;
  }>;
}) {
  const { role, session, focus, difficulty, count, cap, topics } = await searchParams;
  const [profile, features] = await Promise.all([fetchProfile(), fetchFeatures()]);

  // The role query param (from the landing page's Roles grid, a "practice weak area" or "repeat
  // this setup" link, or a resume-derived link) wins over the saved target_role default — an
  // explicit link is a more specific signal than a standing preference.
  const initialRole = toValidRole(role) ?? toValidRole(profile?.target_role ?? undefined);
  const initialCustomRole = toCustomRole(role);
  const initialFocusTopics = toTopics(topics);

  return (
    <InterviewFlow
      initialRole={initialRole}
      panelAvailable={features?.panel_interview ?? false}
      initialCustomRole={initialCustomRole}
      initialFocusTopics={initialFocusTopics}
      initialFocus={toValidFocus(focus)}
      initialDifficulty={toValidDifficulty(difficulty)}
      initialQuestionCount={toValidNumberOption(count, QUESTION_COUNT_OPTIONS)}
      initialAnswerCapS={toValidNumberOption(cap, TIME_CAP_OPTIONS)}
      resumeSessionId={session}
      profile={profile}
    />
  );
}
