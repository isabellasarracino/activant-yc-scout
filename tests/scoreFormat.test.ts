import { describe, expect, it } from "vitest";
import { formatScore } from "../src/lib/scoring/format";

describe("formatScore", () => {
  it("shows a whole number without a decimal, e.g. 7/10 not 7.0/10", () => {
    expect(formatScore(7)).toBe("7/10");
  });

  it("shows one decimal place for a fractional score", () => {
    expect(formatScore(6.8)).toBe("6.8/10");
  });

  it("rounds to one decimal rather than showing long float noise", () => {
    expect(formatScore(6.849999999999)).toBe("6.8/10");
  });

  it("handles the maximum score", () => {
    expect(formatScore(10)).toBe("10/10");
  });

  it("handles zero", () => {
    expect(formatScore(0)).toBe("0/10");
  });
});
