// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreBars } from "../../src/components/dashboard/ScoreBars";

describe("ScoreBars", () => {
  it("renders both scores formatted to one decimal", () => {
    render(<ScoreBars teamGeneralScore={6.2} thesisAlignScore={8.4} primaryCategory="thesis_fit" />);
    expect(screen.getByText("6.2")).toBeInTheDocument();
    expect(screen.getByText("8.4")).toBeInTheDocument();
  });

  it("renders an em dash for a null score rather than crashing or showing NaN", () => {
    render(<ScoreBars teamGeneralScore={null} thesisAlignScore={null} primaryCategory={null} />);
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });

  it("shows both axis labels regardless of which is primary", () => {
    render(<ScoreBars teamGeneralScore={5} thesisAlignScore={5} primaryCategory="team_general" />);
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Thesis")).toBeInTheDocument();
  });
});
