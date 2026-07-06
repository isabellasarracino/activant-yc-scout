// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryBadge } from "../../src/components/dashboard/CategoryBadge";

describe("CategoryBadge", () => {
  it("shows 'Unranked' for a null category", () => {
    render(<CategoryBadge category={null} secondaryTag={false} />);
    expect(screen.getByText("Unranked")).toBeInTheDocument();
  });

  it("shows the full category label for thesis_fit", () => {
    render(<CategoryBadge category="thesis_fit" secondaryTag={false} />);
    expect(screen.getByText("Activant Thesis Fit")).toBeInTheDocument();
  });

  it("shows the full category label for team_general", () => {
    render(<CategoryBadge category="team_general" secondaryTag={false} />);
    expect(screen.getByText("Team & General Interest")).toBeInTheDocument();
  });

  it("does not show a secondary-axis note when secondaryTag is false", () => {
    render(<CategoryBadge category="thesis_fit" secondaryTag={false} />);
    expect(screen.queryByText(/\+ Team/)).not.toBeInTheDocument();
  });

  it("shows a secondary-axis note (not a second full badge) when secondaryTag is true — never both categories as equals", () => {
    render(<CategoryBadge category="thesis_fit" secondaryTag={true} />);
    expect(screen.getByText("Activant Thesis Fit")).toBeInTheDocument();
    expect(screen.getByText("+ Team")).toBeInTheDocument();
    // the "also qualifies" note is not itself styled as a second category badge
    expect(screen.queryByText("Team & General Interest")).not.toBeInTheDocument();
  });

  it("points the secondary note at the other axis correctly for team_general primary", () => {
    render(<CategoryBadge category="team_general" secondaryTag={true} />);
    expect(screen.getByText("+ Thesis")).toBeInTheDocument();
  });
});
