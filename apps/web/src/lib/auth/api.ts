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

/** Server-side fetch to the FastAPI backend. Never called from the browser — route handlers
 * proxy through this so the API's own CORS origin list only ever needs to trust the Next.js
 * server, not arbitrary browsers. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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
