const DELAYS = [0, 0.8, 1.6];

export function RippleRings() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {DELAYS.map((delay) => (
        <div key={delay} className="ripple-ring" style={{ animationDelay: `${delay}s` }} />
      ))}
    </div>
  );
}
