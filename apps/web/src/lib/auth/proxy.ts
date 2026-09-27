import { NextResponse } from "next/server";

import { apiFetch, parseApiError } from "@/lib/auth/api";
import { getValidAccessToken } from "@/lib/auth/session";

/** Shared body for every authed `/api/*` route handler (interview, profile, ...): attach a
 * valid (refreshed if needed) bearer token, forward to the API, and pass the response
 * straight through. Keeps each route handler down to "what path, what method, what body"
 * instead of re-implementing the auth/error handling in every one of them.
 *
 * `clientIp` is only needed for routes the API actually rate-limits by IP (answers uploads) —
 * see apiFetch's `clientIp` option and app/core/rate_limit.py's trusted-proxy handling. */
export async function proxyAuthedRequest(
  path: string,
  init?: RequestInit,
  options?: { clientIp?: string | null },
): Promise<NextResponse> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to continue." } },
      { status: 401 },
    );
  }

  const response = await apiFetch(
    path,
    {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
    },
    options,
  );

  if (!response.ok) {
    const error = await parseApiError(response);
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "upstream_invalid_response",
          message: "The server returned an unexpected response. Please try again.",
        },
      },
      { status: 502 },
    );
  }
  return NextResponse.json(body, { status: response.status });
}
