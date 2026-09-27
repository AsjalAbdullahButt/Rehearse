import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  API_URL: z.url().default("http://localhost:8000"),
  // Server-only; never prefixed with NEXT_PUBLIC_ and never read outside lib/auth/api.ts. Shared
  // with the API's INTERNAL_PROXY_SECRET (apps/api/app/core/config.py) so the API can trust a
  // BFF-forwarded client IP for rate limiting. Optional: when unset, apiFetch simply omits the
  // trusted-proxy headers and the API falls back to its own raw connection IP.
  INTERNAL_PROXY_SECRET: z.string().min(32).optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  API_URL: process.env.API_URL,
  INTERNAL_PROXY_SECRET: process.env.INTERNAL_PROXY_SECRET,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
  );
}

export const env = parsed.data;
