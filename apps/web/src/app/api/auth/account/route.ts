import type { NextResponse } from "next/server";

import { clearSessionCookies } from "@/lib/auth/cookies";
import { proxyAuthedRequest } from "@/lib/auth/proxy";

/** Account deletion is irreversible, so this asks for the current password again — see
 * apps/api/app/routers/auth.py's delete_account docstring for why "ownership via
 * get_current_user" alone isn't treated as confirmation enough for this one action. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);

  const response = await proxyAuthedRequest("/v1/auth/me", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
  if (response.status === 204) {
    // The account (and the tokens the API just revoked along with it) no longer exists —
    // clear the browser's cookies too, rather than leaving a session pointed at nothing.
    clearSessionCookies(response);
  }
  return response;
}
