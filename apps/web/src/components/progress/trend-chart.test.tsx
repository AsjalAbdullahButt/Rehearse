import { render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("img", { name: /Overall score/ })).toBeInTheDocument();
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
});
