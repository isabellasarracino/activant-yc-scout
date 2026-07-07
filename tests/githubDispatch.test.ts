import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchScoreBatchWorkflow } from "../src/lib/github/dispatch";

describe("dispatchScoreBatchWorkflow", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.GITHUB_TOKEN = "test-token";
    process.env.GITHUB_REPOSITORY = "isabellasarracino/activant-yc-scout";
  });

  it("calls GitHub's workflow-dispatch endpoint with the right repo, workflow file, and batch name", async () => {
    const mockFetch = vi.fn(async (_url: string, _options?: RequestInit) => ({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", mockFetch);

    await dispatchScoreBatchWorkflow("Fall 2026");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/isabellasarracino/activant-yc-scout/actions/workflows/score-batch.yml/dispatches",
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(options!.body as string);
    expect(body).toEqual({ ref: "main", inputs: { batch_name: "Fall 2026" } });
  });

  it("sends the token as a bearer auth header", async () => {
    const mockFetch = vi.fn(async (_url: string, _options?: RequestInit) => ({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", mockFetch);

    await dispatchScoreBatchWorkflow("Fall 2026");

    const [, options] = mockFetch.mock.calls[0]!;
    const headers = options!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("throws a clear, actionable error when GitHub rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, text: async () => "Not Found" })));
    await expect(dispatchScoreBatchWorkflow("Fall 2026")).rejects.toThrow(/404/);
  });

  it("throws a clear error when GITHUB_TOKEN is not set, rather than making a doomed request", async () => {
    delete process.env.GITHUB_TOKEN;
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(dispatchScoreBatchWorkflow("Fall 2026")).rejects.toThrow(/GITHUB_TOKEN/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws a clear error when GITHUB_REPOSITORY is not set", async () => {
    delete process.env.GITHUB_REPOSITORY;
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(dispatchScoreBatchWorkflow("Fall 2026")).rejects.toThrow(/GITHUB_REPOSITORY/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
