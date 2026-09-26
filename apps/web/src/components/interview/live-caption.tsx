/** Shows what the person is currently saying, from the browser's own live speech recognition
 * (see hooks/use-live-captions.ts) — purely so they can see they're being heard, not part of
 * the actual scored transcript. Renders nothing on an unsupported browser rather than an empty
 * box that never fills in. */
export function LiveCaption({
  isSupported,
  transcript,
}: {
  isSupported: boolean;
  transcript: string;
}) {
  if (!isSupported) return null;

  return (
    <p
      aria-live="polite"
      className="text-muted min-h-5 max-w-md text-center text-sm text-balance italic"
    >
      {transcript ? `"${transcript}"` : "Listening…"}
    </p>
  );
}
