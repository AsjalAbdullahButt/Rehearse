// Direct server-side reads for Server Components — these call the API straight, skipping the
// /api/* route handlers (those exist for client components, which can't attach the httpOnly
// cookie's bearer token themselves).

import { apiFetch, type UserPublic } from "@/lib/auth/api";
import { getValidAccessToken } from "@/lib/auth/session";
import type { AnswerReport, ProgressOut, Profile } from "@/lib/interview/types";

async function fetchFromApi<T>(path: string): Promise<T | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const response = await apiFetch(path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;

  return (await response.json()) as T;
}

export function fetchCurrentUser(): Promise<UserPublic | null> {
  return fetchFromApi<UserPublic>("/v1/auth/me");
}

export function fetchAnswerReport(answerId: string): Promise<AnswerReport | null> {
  return fetchFromApi<AnswerReport>(`/v1/answers/${encodeURIComponent(answerId)}`);
}

export function fetchProgress(): Promise<ProgressOut | null> {
  return fetchFromApi<ProgressOut>("/v1/progress");
}

export function fetchProfile(): Promise<Profile | null> {
  return fetchFromApi<Profile>("/v1/profile");
}
