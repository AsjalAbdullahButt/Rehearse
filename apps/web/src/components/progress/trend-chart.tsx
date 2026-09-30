"use client";

// A hand-rolled, dependency-free SVG line chart — this project has no charting library
// dependency, and pulling one in for a handful of trend lines using the app's own design
// tokens wasn't worth the added weight. Single axis always (never a dual-axis chart); a legend
// only appears for 2+ series (a single series is named by its section heading instead); axis
// ticks are labeled (not just gridlines) so a reader can tell what they're looking at without
// hovering; a crosshair + combined tooltip reads out every series at once on hover/focus; every
// point also carries a native <title> and an aria-label so the same value is reachable on
// keyboard focus, not just a mouse; and a visually-hidden <table> gives the exact same data to
// screen readers / anyone who wants precise values instead of reading the line.

import { useState, type MouseEvent } from "react";

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
const HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 28, left: 40 };
const MAX_X_TICKS = 5;
// Hover/focus hit target — bigger than the painted 4px dot, per the "24px minimum hit area"
// rule for small marks (an 8px dot is a pinpoint nobody hits reliably).
const HIT_RADIUS = 12;

function scaleY(value: number, min: number, max: number): number {
  const range = max - min || 1;
  const fraction = (value - min) / range;
  return PADDING.top + (1 - fraction) * (HEIGHT - PADDING.top - PADDING.bottom);
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return (WIDTH - PADDING.left - PADDING.right) / 2 + PADDING.left;
  return PADDING.left + (index / (count - 1)) * (WIDTH - PADDING.left - PADDING.right);
}

/** Evenly-spaced tick indices (first, last, and up to MAX_X_TICKS - 2 in between) — every
 * point would clutter the axis once a role has more than a handful of sessions; the exact
 * date for every point is still in the tooltip, focus readout, and table. */
function xTickIndices(pointCount: number): number[] {
  if (pointCount <= MAX_X_TICKS) return Array.from({ length: pointCount }, (_, i) => i);
  const ticks = Array.from({ length: MAX_X_TICKS }, (_, i) =>
    Math.round((i / (MAX_X_TICKS - 1)) * (pointCount - 1)),
  );
  return Array.from(new Set(ticks));
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  function setHoverFromClientX(svg: SVGSVGElement, clientX: number) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = (clientX - rect.left) * (WIDTH / rect.width);
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const fraction = (svgX - PADDING.left) / plotWidth;
    const index = Math.round(fraction * Math.max(pointCount - 1, 0));
    setHoverIndex(Math.max(0, Math.min(pointCount - 1, index)));
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    setHoverFromClientX(event.currentTarget, event.clientX);
  }

  function handlePointFocus(index: number) {
    return () => setHoverIndex(index);
  }

  const hoveredValues =
    hoverIndex !== null
      ? series
          .map((s) => ({ ...s, point: s.points[hoverIndex] }))
          .filter((s): s is typeof s & { point: TrendPoint } => (s.point?.y ?? null) !== null)
      : [];
  const hoverXFraction = hoverIndex !== null ? scaleX(hoverIndex, pointCount) / WIDTH : null;

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

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${series.map((s) => s.label).join(", ")} over time`}
          className="w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridlines.map((value) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={scaleY(value, yMin, yMax)}
                y2={scaleY(value, yMin, yMax)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={scaleY(value, yMin, yMax)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--color-muted)"
                fontSize={10}
              >
                {formatTick(value)}
                {yUnit}
              </text>
            </g>
          ))}

          {xTickIndices(pointCount).map((i) => (
            <text
              key={i}
              x={scaleX(i, pointCount)}
              y={HEIGHT - PADDING.bottom + 16}
              textAnchor="middle"
              fill="var(--color-muted)"
              fontSize={10}
            >
              {series[0]?.points[i]?.x}
            </text>
          ))}

          {hoverIndex !== null ? (
            <line
              x1={scaleX(hoverIndex, pointCount)}
              x2={scaleX(hoverIndex, pointCount)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--color-line)"
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          ) : null}

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
                  <g key={p.i}>
                    <circle
                      cx={scaleX(p.i, pointCount)}
                      cy={scaleY(p.y!, yMin, yMax)}
                      r={hoverIndex === p.i ? 6 : 4}
                      fill={s.color}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                    {/* The real hit target — transparent, bigger than the painted dot, and
                        focusable so the same readout a mouse gets is reachable on Tab. */}
                    <circle
                      cx={scaleX(p.i, pointCount)}
                      cy={scaleY(p.y!, yMin, yMax)}
                      r={HIT_RADIUS}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${s.label}: ${p.x} — ${p.y}${yUnit}`}
                      onFocus={handlePointFocus(p.i)}
                    >
                      <title>
                        {s.label}: {p.x} — {p.y}
                        {yUnit}
                      </title>
                    </circle>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>

        {hoverIndex !== null && hoveredValues.length > 0 && hoverXFraction !== null ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-surface border-line pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-[var(--radius-tile)] border px-3 py-2 text-xs whitespace-nowrap shadow-lg"
            style={{
              left: `${Math.min(88, Math.max(12, hoverXFraction * 100))}%`,
              top: `${(PADDING.top / HEIGHT) * 100}%`,
            }}
          >
            <span className="text-muted">{series[0]?.points[hoverIndex]?.x}</span>
            {hoveredValues.map(({ key, label, color, point }) => (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-2.5"
                  style={{ backgroundColor: color }}
                />
                <span className="text-text font-medium tabular-nums">
                  {point.y}
                  {yUnit}
                </span>
                <span className="text-muted">{label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

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
