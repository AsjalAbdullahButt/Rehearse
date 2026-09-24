"use client";

import { usePathname, useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** Detects the one background failure every authed client fetch can hit: the session expired
 * or was revoked between page load and this request. `proxyAuthedRequest`
 * (lib/auth/proxy.ts) always reports that as 401 with `code: "unauthorized"` — anything else
 * (validation, rate limit, upstream failure) is left for the caller's own error handling.
 * Returns true once it has handled the response (toast + redirect to sign-in), so the caller
 * should stop instead of also rendering its own error state. */
export function useSessionExpiry(): (response: Response) => Promise<boolean> {
  const router = useRouter();
  const pathname = usePathname();
  const { push } = useToast();

  return async (response: Response) => {
    if (response.status !== 401) return false;

    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    if (body?.error?.code !== "unauthorized") return false;

    push("Your session expired. Sign in to continue.", "error");
    router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
    return true;
  };
}
