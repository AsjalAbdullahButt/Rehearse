import { InterviewFlow } from "@/components/interview/interview-flow";
import { fetchProfile } from "@/lib/interview/server";
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
  }>;
}) {
  const { role, session, focus, difficulty, count, cap } = await searchParams;
  const profile = await fetchProfile();

  // The role query param (from the landing page's Roles grid, a "practice weak area" or "repeat
  // this setup" link, or a resume-derived link) wins over the saved target_role default — an
  // explicit link is a more specific signal than a standing preference.
  const initialRole = toValidRole(role) ?? toValidRole(profile?.target_role ?? undefined);

  return (
    <InterviewFlow
      initialRole={initialRole}
      initialFocus={toValidFocus(focus)}
      initialDifficulty={toValidDifficulty(difficulty)}
      initialQuestionCount={toValidNumberOption(count, QUESTION_COUNT_OPTIONS)}
      initialAnswerCapS={toValidNumberOption(cap, TIME_CAP_OPTIONS)}
      resumeSessionId={session}
      profile={profile}
    />
  );
}
