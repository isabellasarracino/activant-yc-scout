// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleCompactCompany, sampleFullCompany } from "./fixtures";

const mockFetchCompanyDetail = vi.fn();
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return { ...actual, fetchCompanyDetail: mockFetchCompanyDetail };
});

const { CompanyCard } = await import("../../src/components/dashboard/CompanyCard");

describe("CompanyCard", () => {
  beforeEach(() => {
    mockFetchCompanyDetail.mockReset();
  });

  it("shows compact info without fetching full detail", () => {
    render(<CompanyCard company={sampleCompactCompany} />);
    expect(screen.getByText("Florin")).toBeInTheDocument();
    expect(screen.getByText(sampleCompactCompany.oneLiner)).toBeInTheDocument();
    expect(mockFetchCompanyDetail).not.toHaveBeenCalled();
  });

  it("fetches and shows full detail only when clicked", async () => {
    mockFetchCompanyDetail.mockResolvedValueOnce(sampleFullCompany);
    const user = userEvent.setup();
    render(<CompanyCard company={sampleCompactCompany} />);

    await user.click(screen.getByRole("button"));

    expect(mockFetchCompanyDetail).toHaveBeenCalledWith("florin");
    await waitFor(() => expect(screen.getByText("Shaurya Aggarwal")).toBeInTheDocument());
    expect(screen.getByText(/Squarely fintech infrastructure/)).toBeInTheDocument();
  });

  it("only fetches once across multiple expand/collapse cycles", async () => {
    mockFetchCompanyDetail.mockResolvedValueOnce(sampleFullCompany);
    const user = userEvent.setup();
    render(<CompanyCard company={sampleCompactCompany} />);
    const toggle = screen.getByRole("button");

    await user.click(toggle); // expand -> fetches
    await waitFor(() => expect(screen.getByText("Shaurya Aggarwal")).toBeInTheDocument());
    await user.click(toggle); // collapse
    await user.click(toggle); // expand again -> should use cached detail, not refetch

    await waitFor(() => expect(screen.getByText("Shaurya Aggarwal")).toBeInTheDocument());
    expect(mockFetchCompanyDetail).toHaveBeenCalledTimes(1);
  });

  it("shows an error message rather than crashing if the detail fetch fails", async () => {
    mockFetchCompanyDetail.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<CompanyCard company={sampleCompactCompany} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByText(/Couldn't load full detail/)).toBeInTheDocument());
  });

  it("renders a helpful message rather than a rubric section when a company hasn't been scored", async () => {
    mockFetchCompanyDetail.mockResolvedValueOnce({ ...sampleFullCompany, rubricBreakdown: null });
    const user = userEvent.setup();
    render(<CompanyCard company={sampleCompactCompany} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByText("Not scored yet.")).toBeInTheDocument());
  });
});
