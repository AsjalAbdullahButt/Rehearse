VERCEL_FUNCTION_BODY_LIMIT_BYTES = 4 * 1024 * 1024 + 500 * 1024  # ~4.5MB
"""Vercel Functions (Hobby tier, what this project's free-tier deployment runs on) reject any
request body over roughly 4.5MB before the function even runs — no application-level
configuration raises this ceiling. Every accepted-request constant below MUST stay safely under
it, with margin left over for Vercel's own request framing on top of the raw body. This project
must never promise a full 4.5MB of accepted payload for that reason — see MAX_REQUEST_BODY_BYTES."""

MAX_AUDIO_FILE_BYTES = 4 * 1024 * 1024
"""Maximum size accepted for the `audio` upload FIELD itself (not the whole HTTP request) —
enforced in app/routers/answers.py's `_read_capped`, which reads and bounds only that field's
bytes, independent of whatever multipart boilerplate surrounds it."""

MAX_RESUME_FILE_BYTES = 2 * 1024 * 1024
"""Maximum size accepted for the `resume` upload FIELD itself (not the whole HTTP request) in
app/routers/resume.py — a text-based resume PDF is rarely more than a few hundred KB; 2MB
comfortably covers an image-heavy one-pager without accepting an arbitrarily large file."""

MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 256 * 1024
"""Headroom for everything in a multipart request besides the file field itself: boundary
delimiters, per-part headers, and small text fields (session_id, session_question_id, an
Idempotency-Key header counted separately but still part of the request). 256KB is generous for
all of that combined many times over — real multipart overhead for these routes is a few hundred
bytes, not kilobytes."""

MAX_REQUEST_BODY_BYTES = MAX_AUDIO_FILE_BYTES + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
"""The maximum whole-HTTP-request size, enforced ASGI-wide by app/core/middleware.py's
MaxBodySizeMiddleware ahead of Starlette's own multipart parsing — there is exactly one instance
of this middleware, covering every route, so it's sized for the *largest* legitimate request this
API accepts (an answer upload: MAX_AUDIO_FILE_BYTES plus its own multipart overhead). The resume
route's smaller request (see MAX_RESUME_REQUEST_BYTES below) stays comfortably under this same
ceiling too, so it doesn't need a second middleware instance.

4MB + 256KB = ~4.25MB, leaving ~250KB of margin under VERCEL_FUNCTION_BODY_LIMIT_BYTES for
Vercel's own request framing on top of this — comfortable, not exact. This API never accepts (and
never claims to accept) the full ~4.5MB Vercel technically allows through."""

MAX_RESUME_REQUEST_BYTES = MAX_RESUME_FILE_BYTES + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
"""The Next.js BFF's own declared-Content-Length pre-check for `POST /api/interview/resume` (see
apps/web/src/app/api/interview/resume/route.ts) must compare the request's Content-Length against
THIS, not MAX_RESUME_FILE_BYTES alone — a resume PDF sitting right at the 2MB file cap, plus its
own multipart boundary/headers, pushes the whole request's Content-Length slightly past 2MB even
though the file itself is within bounds. Comparing the whole request against the bare file cap
would incorrectly reject that legitimate upload; this constant exists specifically to fix that."""
