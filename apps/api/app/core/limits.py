MAX_AUDIO_BYTES = 4 * 1024 * 1024
"""Maximum size accepted for the `audio` upload field itself — enforced in
app/routers/answers.py's `_read_capped`."""

MAX_RESUME_BYTES = 2 * 1024 * 1024
"""Maximum size accepted for the `resume` upload field in app/routers/resume.py — a text-based
resume PDF is rarely more than a few hundred KB; 2MB comfortably covers an image-heavy one-pager
without accepting an arbitrary large file."""

MAX_REQUEST_BODY_BYTES = MAX_AUDIO_BYTES + 1 * 1024 * 1024
"""Enforced ASGI-wide by app/core/middleware.py's MaxBodySizeMiddleware, ahead of Starlette's
own multipart parsing. Deliberately looser than MAX_AUDIO_BYTES — it bounds the whole HTTP
request (audio bytes plus multipart boilerplate: form fields, boundaries, per-part headers),
not the audio field alone, so it must stay above MAX_AUDIO_BYTES rather than duplicate it. Also
comfortably covers MAX_RESUME_BYTES, which is smaller."""
