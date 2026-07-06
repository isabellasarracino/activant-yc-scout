// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyGrid } from "../../src/components/dashboard/CompanyGrid";
import { sampleCompactCompany } from "./fixtures";

const companyB = { ...sampleCompactCompany, slug: "beta", name: "Beta Co", thesisAlignScore: 7.1 };
const companyA = { ...sampleCompactCompany, slug: "alpha", name: "Alpha Co", thesisAlignScore: 9.0 };

describe("CompanyGrid rank display", () => {
  it("shows no rank badges or caption when rank is off (default)", () => {
    render(<CompanyGrid title="Thesis Fit" accent="var(--thesis)" companies={[companyA, companyB]} emptyMessage="" />);
    expect(screen.queryByText("Ranked highest score first")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Rank 1 of/)).not.toBeInTheDocument();
  });

  it("shows a rank badge per card, numbered from 1, in the order the data arrives (already sorted server-side)", () => {
    render(<CompanyGrid title="Thesis Fit" accent="var(--thesis)" companies={[companyA, companyB]} emptyMessage="" rank />);
    expect(screen.getByText("Ranked highest score first")).toBeInTheDocument();
    expect(screen.getByTitle("Rank 1 of 2")).toBeInTheDocument();
    expect(screen.getByTitle("Rank 2 of 2")).toBeInTheDocument();
  });

  it("does not show the ranking caption when the section is empty", () => {
    render(<CompanyGrid title="Thesis Fit" accent="var(--thesis)" companies={[]} emptyMessage="Nothing here yet." rank />);
    expect(screen.queryByText("Ranked highest score first")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("does not re-sort — it trusts the order it's given", () => {
    // companyB first even though companyA has the higher score, to prove
    // the component displays server order rather than re-sorting itself.
    render(<CompanyGrid title="Thesis Fit" accent="var(--thesis)" companies={[companyB, companyA]} emptyMessage="" rank />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Beta Co", "Alpha Co"]);
  });
});
