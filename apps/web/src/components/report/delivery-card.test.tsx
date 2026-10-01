import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DeliveryItem } from "@/lib/interview/types";

import { DeliveryCard } from "./delivery-card";

const items: DeliveryItem[] = [
  { key: "pace", label: "Pace", rating: "good", detail: "150 words per minute is comfortable." },
  { key: "energy", label: "Energy", rating: "needs_work", detail: "Your energy stayed constant." },
  { key: "pitch", label: "Pitch variation", rating: "not_measured", detail: "Not measured." },
];

describe("DeliveryCard", () => {
  it("writes every rating out as words and explains what was measured", () => {
    render(
      <DeliveryCard
        heading="Delivery"
        items={items}
        advice={["Emphasise your key decision."]}
        footnote="Separate from the content score."
      />,
    );

    expect(screen.getByRole("region", { name: "Delivery" })).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Needs work")).toBeInTheDocument();
    // Unmeasured is stated in both the chip and the detail, never hidden or guessed.
    expect(screen.getByText("Not measured")).toBeInTheDocument();
    expect(screen.getByText("Not measured.")).toBeInTheDocument();
    expect(screen.getByText("150 words per minute is comfortable.")).toBeInTheDocument();
    expect(screen.getByText("Emphasise your key decision.")).toBeInTheDocument();
    expect(screen.getByText("Separate from the content score.")).toBeInTheDocument();
  });

  it("shows no numeric prosody score", () => {
    render(<DeliveryCard heading="Delivery" items={items} advice={[]} />);
    expect(screen.queryByText(/prosody score|\/100/i)).not.toBeInTheDocument();
  });
});
