// Direct server-side reads for Server Components — these call the API straight, skipping the
// /api/* route handlers (those exist for client components, which can't attach the httpOnly
// cookie's bearer token themselves).

import { apiFetch, type UserPublic } from "@/lib/auth/api";
import { peekAccessToken } from "@/lib/auth/session";
import type {
  AnswerReport,
  AttemptComparison,
  Features,
  MasteryOut,
  PracticePlan,
  ProgressOut,
  Profile,
  ReadinessOut,
  ReportShare,
  SessionSummary,
  SharedReport,
} from "@/lib/interview/types";

async function fetchFromApi<T>(path: string, distinguishFailure = false): Promise<T | null> {
  const accessToken = await peekAccessToken();
  if (!accessToken) return null;

  const response = await apiFetch(path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (distinguishFailure && response.status !== 404)
      throw new Error("The requested data could not be loaded.");
    return null;
  }

  return (await response.json()) as T;
}

export function fetchCurrentUser(): Promise<UserPublic | null> {
  return fetchFromApi<UserPublic>("/v1/auth/me");
}

export function fetchAnswerReport(answerId: string): Promise<AnswerReport | null> {
  return fetchFromApi<AnswerReport>(`/v1/answers/${encodeURIComponent(answerId)}`, true);
}

export function fetchFeatures(): Promise<Features | null> {
  return fetchFromApi<Features>("/v1/features");
}

export function fetchAttempts(answerId: string): Promise<AttemptComparison | null> {
  return fetchFromApi<AttemptComparison>(`/v1/answers/${encodeURIComponent(answerId)}/attempts`);
}

export function fetchReportShares(answerId: string): Promise<ReportShare[] | null> {
  return fetchFromApi<ReportShare[]>(`/v1/reports/${encodeURIComponent(answerId)}/shares`);
}

export async function fetchSharedReport(token: string): Promise<SharedReport | null> {
  const response = await apiFetch(`/v1/shared-reports/${encodeURIComponent(token)}`);
  if (!response.ok) return null;
  return (await response.json()) as SharedReport;
}

export function fetchMastery(): Promise<MasteryOut | null> {
  return fetchFromApi<MasteryOut>("/v1/mastery", true);
}

export function fetchReadiness(role: string): Promise<ReadinessOut | null> {
  return fetchFromApi<ReadinessOut>(`/v1/readiness?role=${encodeURIComponent(role)}`);
}

export function fetchPracticePlan(role: string): Promise<PracticePlan | null> {
  return fetchFromApi<PracticePlan>(`/v1/practice-plan?role=${encodeURIComponent(role)}`);
}

export function fetchProgress(page = 1): Promise<ProgressOut | null> {
  return fetchFromApi<ProgressOut>(`/v1/progress?limit=20&offset=${(page - 1) * 20}`);
}

export function fetchProfile(): Promise<Profile | null> {
  return fetchFromApi<Profile>("/v1/profile");
}

export function fetchSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  return fetchFromApi<SessionSummary>(`/v1/sessions/${encodeURIComponent(sessionId)}`, true);
}
