import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendChart, type TrendSeries } from "./trend-chart";

describe("TrendChart", () => {
  it("shows the empty message when there is no data at all", () => {
    const series: TrendSeries[] = [
      { key: "score", label: "Score", color: "var(--color-lime)", points: [] },
    ];

    render(<TrendChart series={series} emptyMessage="Not enough data yet." />);

    expect(screen.getByText("Not enough data yet.")).toBeInTheDocument();
  });

  it("shows the empty message when every point is null", () => {
    const series: TrendSeries[] = [
      {
        key: "score",
        label: "Score",
        color: "var(--color-lime)",
        points: [
          { x: "Jan 1", y: null },
          { x: "Jan 2", y: null },
        ],
      },
    ];

    render(<TrendChart series={series} />);

    expect(screen.getByText("Not enough data yet.")).toBeInTheDocument();
  });

  it("renders a chart with an accessible name once real data exists", () => {
    const series: TrendSeries[] = [
      {
        key: "score",
        label: "Overall score",
        color: "var(--color-lime)",
        points: [
          { x: "Jan 1", y: 6 },
          { x: "Jan 2", y: 8 },
        ],
      },
    ];

    render(<TrendChart series={series} />);

    // Exact match: each data point also carries its own role="img" hit target (e.g. "Overall
    // score: Jan 1 — 6"), so a loose /Overall score/ regex here would now match more than one
    // element and fail — this pins down the chart's own accessible name specifically.
    expect(screen.getByRole("img", { name: "Overall score over time" })).toBeInTheDocument();
  });

  it("shows a legend only when there are 2+ series", () => {
    const single: TrendSeries[] = [
      {
        key: "a",
        label: "Solo series",
        color: "var(--color-lime)",
        points: [{ x: "Jan 1", y: 5 }],
      },
    ];
    const multi: TrendSeries[] = [
      { key: "a", label: "Behavioral", color: "var(--color-lime)", points: [{ x: "Jan 1", y: 5 }] },
      {
        key: "b",
        label: "Technical",
        color: "var(--color-violet)",
        points: [{ x: "Jan 1", y: 7 }],
      },
    ];

    const { rerender } = render(<TrendChart series={single} />);
    // The always-present accessible table still names the series once, in a <th> — only the
    // visible legend row is conditional on 2+ series, so a single occurrence means no legend.
    expect(screen.getAllByText("Solo series")).toHaveLength(1);

    rerender(<TrendChart series={multi} />);
    expect(screen.getAllByText("Behavioral").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Technical").length).toBeGreaterThan(1);
  });

  it("includes an accessible data table with the same values", () => {
    const series: TrendSeries[] = [
      {
        key: "score",
        label: "Overall score",
        color: "var(--color-lime)",
        points: [
          { x: "Jan 1", y: 6 },
          { x: "Jan 2", y: 8 },
        ],
      },
    ];

    render(<TrendChart series={series} />);

    const table = screen.getByRole("table", { hidden: true });
    expect(table).toHaveTextContent("Jan 1");
    expect(table).toHaveTextContent("6");
    expect(table).toHaveTextContent("Jan 2");
    expect(table).toHaveTextContent("8");
  });

  it("shows visible Y-axis tick labels, not just gridlines", () => {
    const series: TrendSeries[] = [
      {
        key: "score",
        label: "Overall score",
        color: "var(--color-lime)",
        points: [
          { x: "Jan 1", y: 6 },
          { x: "Jan 2", y: 8 },
        ],
      },
    ];

    render(<TrendChart series={series} yMax={10} />);

    // 5 gridlines at yMax=10, step 2.5 → 0, 2.5, 5, 7.5, 10.
    expect(screen.getByText("7.5")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("shows a combined tooltip readout naming every series when a point gets keyboard focus", () => {
    const series: TrendSeries[] = [
      { key: "a", label: "Behavioral", color: "var(--color-lime)", points: [{ x: "Jan 1", y: 5 }] },
      {
        key: "b",
        label: "Technical",
        color: "var(--color-violet)",
        points: [{ x: "Jan 1", y: 7 }],
      },
    ];

    render(<TrendChart series={series} yMax={10} />);

    const hitTargets = screen.getAllByRole("img", { name: /Jan 1/ });
    fireEvent.focus(hitTargets[0]!);

    const tooltip = screen.getByRole("status");
    expect(tooltip).toHaveTextContent("Behavioral");
    expect(tooltip).toHaveTextContent("Technical");
  });

  it("gives every data point a focusable, labeled hit target reachable by keyboard", () => {
    const series: TrendSeries[] = [
      {
        key: "score",
        label: "Overall score",
        color: "var(--color-lime)",
        points: [
          { x: "Jan 1", y: 6 },
          { x: "Jan 2", y: 8 },
        ],
      },
    ];

    render(<TrendChart series={series} />);

    const point = screen.getByRole("img", { name: "Overall score: Jan 2 — 8" });
    // React renders the `tabIndex` prop as the lowercase `tabindex` DOM attribute.
    expect(point).toHaveAttribute("tabindex", "0");
  });
});
