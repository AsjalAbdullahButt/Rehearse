// A hand-rolled, dependency-free SVG line chart — this project has no charting library
// dependency, and pulling one in for a handful of trend lines using the app's own design
// tokens wasn't worth the added weight. Single axis always (never a dual-axis chart); a legend
// only appears for 2+ series (a single series is named by its section heading instead); every
// point carries a native <title> tooltip, and a visually-hidden <table> gives the same data to
// screen readers / anyone who wants exact values instead of reading the line.

export interface TrendPoint {
  x: string;
  y: number | null;
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  points: TrendPoint[];
}

const WIDTH = 480;
const HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 24, left: 32 };

function scaleY(value: number, min: number, max: number): number {
  const range = max - min || 1;
  const fraction = (value - min) / range;
  return PADDING.top + (1 - fraction) * (HEIGHT - PADDING.top - PADDING.bottom);
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return (WIDTH - PADDING.left - PADDING.right) / 2 + PADDING.left;
  return PADDING.left + (index / (count - 1)) * (WIDTH - PADDING.left - PADDING.right);
}

export function TrendChart({
  series,
  yMax = 10,
  yUnit = "",
  emptyMessage = "Not enough data yet.",
}: {
  series: TrendSeries[];
  yMax?: number;
  yUnit?: string;
  emptyMessage?: string;
}) {
  const pointCount = series[0]?.points.length ?? 0;
  const hasAnyData = series.some((s) => s.points.some((p) => p.y !== null));

  if (pointCount === 0 || !hasAnyData) {
    return <p className="text-muted py-8 text-center text-sm">{emptyMessage}</p>;
  }

  const yMin = 0;
  const gridlineCount = 4;
  const gridlines = Array.from(
    { length: gridlineCount + 1 },
    (_, i) => yMin + (yMax - yMin) * (i / gridlineCount),
  );

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.key} className="text-muted flex items-center gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} over time`}
        className="w-full"
      >
        {gridlines.map((value) => (
          <line
            key={value}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={scaleY(value, yMin, yMax)}
            y2={scaleY(value, yMin, yMax)}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        ))}

        {series.map((s) => {
          const definedPoints = s.points
            .map((p, i) => ({ ...p, i }))
            .filter((p): p is TrendPoint & { i: number } => p.y !== null);
          const path = definedPoints
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${scaleX(p.i, pointCount)},${scaleY(p.y!, yMin, yMax)}`,
            )
            .join(" ");

          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" />
              {definedPoints.map((p) => (
                <circle
                  key={p.i}
                  cx={scaleX(p.i, pointCount)}
                  cy={scaleY(p.y!, yMin, yMax)}
                  r={4}
                  fill={s.color}
                >
                  <title>
                    {s.label}: {p.x} — {p.y}
                    {yUnit}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{series.map((s) => s.label).join(", ")} by session</caption>
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series[0]?.points.map((point, i) => (
            <tr key={point.x + i}>
              <td>{point.x}</td>
              {series.map((s) => (
                <td key={s.key}>{s.points[i]?.y ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
