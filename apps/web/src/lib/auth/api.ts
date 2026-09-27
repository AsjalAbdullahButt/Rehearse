import { env } from "@/lib/env";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface UserPublic {
  id: string;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserPublic;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** The real browser IP for a rate-limited route (`x-forwarded-for`'s first hop, falling back to
 * `x-real-ip`) — Vercel's edge sets these reliably for traffic actually reaching this Next.js
 * server; a local dev server simply won't have either, and callers degrade to no forwarded IP
 * at all rather than trusting anything unverified. Only pass the result to `apiFetch` for
 * routes that are actually rate-limited (login, register, answers) — see its `clientIp` option. */
export function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

/** Server-side fetch to the FastAPI backend. Never called from the browser — route handlers
 * proxy through this so the API's own CORS origin list only ever needs to trust the Next.js
 * server, not arbitrary browsers. */
export async function apiFetch(
  path: string,
  init?: RequestInit,
  options?: { clientIp?: string | null },
): Promise<Response> {
  // A `Headers` instance (rather than a plain object) correctly normalizes every `HeadersInit`
  // shape `init?.headers` might be (a `Headers`, an array of tuples, or a record) — a plain
  // object spread silently drops entries when it's actually a `Headers` instance.
  const headers = new Headers(init?.headers);

  // A FormData body (the multipart answer upload) must NOT get an explicit Content-Type —
  // fetch needs to generate its own boundary parameter, which setting the header by hand
  // would clobber.
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Proves to the API that a forwarded client IP genuinely came from this BFF (see
  // app/core/rate_limit.py's _trusted_forwarded_ip) rather than an arbitrary caller spoofing a
  // forwarded-for-style header directly against the public API.
  if (env.INTERNAL_PROXY_SECRET && options?.clientIp) {
    headers.set("X-Internal-Proxy-Secret", env.INTERNAL_PROXY_SECRET);
    headers.set("X-Internal-Client-Ip", options.clientIp);
  }

  return fetch(`${env.API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function parseApiError(response: Response): Promise<ApiRequestError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiRequestError(
    response.status,
    body?.error.code ?? "unknown_error",
    body?.error.message ?? "Something went wrong. Please try again.",
  );
}
