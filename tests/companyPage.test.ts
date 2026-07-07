import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

function toolCallResponse(input: unknown) {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "record_founders", arguments: JSON.stringify(input) } },
          ],
        },
      },
    ],
  };
}

const { fetchCompanyPageHtml, extractFoundersFromHtml } = await import("../src/lib/yc/companyPage");

describe("fetchCompanyPageHtml", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns the page text on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html>hi</html>" })));
    const html = await fetchCompanyPageHtml("https://www.ycombinator.com/companies/florin");
    expect(html).toBe("<html>hi</html>");
  });

  it("returns null (not a throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const html = await fetchCompanyPageHtml("https://www.ycombinator.com/companies/florin");
    expect(html).toBeNull();
  });

  it("returns null (not a throw) when the fetch itself rejects, e.g. a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("AbortError");
      })
    );
    const html = await fetchCompanyPageHtml("https://www.ycombinator.com/companies/florin");
    expect(html).toBeNull();
  });
});

describe("extractFoundersFromHtml", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("parses the record_founders tool call into a Founder[]", async () => {
    // This is the real founders section from ycombinator.com/companies/florin,
    // captured 2026-07-02. We're testing that we correctly unpack the
    // model's structured response, not extraction quality itself (that
    // needs a live OPENROUTER_API_KEY — see docs/ARCHITECTURE.md#testing).
    mockCreate.mockResolvedValueOnce(
      toolCallResponse({
        founders: [
          {
            name: "Shaurya Aggarwal",
            title: "Founder & CEO",
            bio: "Built TPUs in the next-gen TPU team at Google. Before that, worked on greenfield at-rest and in-transit encryption products deployed across 100,000+ hosts. BS in Computer Science from Purdue.",
            linkedinUrl: "https://www.linkedin.com/in/shauryaagg",
            twitterUrl: "https://x.com/shauryaagg",
          },
          {
            name: "Amol Pant",
            title: "Co-Founder & CTO",
            bio: "Built perception stack at Orchard Robotics, worked on Tesla's exaflop computer for Autopilot, built prototypes for autonomous rovers for NASA Artemis, worked flight simulators for Boeing.",
            linkedinUrl: "https://www.linkedin.com/in/amolpant/",
          },
          {
            name: "Aydin Sorensen",
            title: "Founder",
            bio: "7+ year Tech Lead at Amazon AWS & Twitch. Most recently, founding employee at TerraFirma (vertically integrated construction robotics); scaled realized revenue from $500k to $30m.",
            linkedinUrl: "https://linkedin.com/in/peterasorensen",
            twitterUrl: "https://x.com/formerlypeter",
          },
        ],
      })
    );

    const founders = await extractFoundersFromHtml("<html>...founders markup...</html>");

    expect(founders).toHaveLength(3);
    expect(founders[0]).toMatchObject({
      name: "Shaurya Aggarwal",
      title: "Founder & CEO",
      linkedinUrl: "https://www.linkedin.com/in/shauryaagg",
    });
    expect(founders[1]?.bio).toContain("Orchard Robotics");
  });

  it("returns an empty array if the model returns no tool call", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { tool_calls: [] } }] });
    const founders = await extractFoundersFromHtml("<html>no founders here</html>");
    expect(founders).toEqual([]);
  });

  it("caps the HTML sent to the model so token spend stays predictable", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse({ founders: [] }));
    const huge = "<div>x</div>".repeat(10_000); // ~120k chars
    await extractFoundersFromHtml(huge);
    const sentContent = mockCreate.mock.calls[0]?.[0].messages[0].content as string;
    expect(sentContent.length).toBeLessThan(21_000);
  });
});
