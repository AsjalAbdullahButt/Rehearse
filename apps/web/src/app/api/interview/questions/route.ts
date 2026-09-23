import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { proxyAuthedRequest } from "@/lib/interview/proxy";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const role = searchParams.get("role");
  if (!role) {
    return NextResponse.json(
      { error: { code: "missing_role", message: "A role is required." } },
      { status: 422 },
    );
  }

  const query = new URLSearchParams({ role });
  const difficulty = searchParams.get("difficulty");
  if (difficulty) query.set("difficulty", difficulty);

  return proxyAuthedRequest(`/v1/questions?${query.toString()}`);
}
