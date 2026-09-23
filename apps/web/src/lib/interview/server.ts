// Direct server-side reads for Server Components — these call the API straight, skipping the
// /api/interview/* route handlers (those exist for client components, which can't attach the
// httpOnly cookie's bearer token themselves).

import { apiFetch, type UserPublic } from "@/lib/auth/api";
import { getValidAccessToken } from "@/lib/auth/session";
import type { AnswerReport } from "@/lib/interview/types";

export async function fetchCurrentUser(): Promise<UserPublic | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const response = await apiFetch("/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;

  return (await response.json()) as UserPublic;
}

export async function fetchAnswerReport(answerId: string): Promise<AnswerReport | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const response = await apiFetch(`/v1/answers/${encodeURIComponent(answerId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;

  return (await response.json()) as AnswerReport;
}
