import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fixtures/fakeDb";
import { upsertBatch } from "../../src/lib/db/repository";

const db = createFakeDb();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => db }));

const mockDispatch = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/github/dispatch", () => ({ dispatchScoreBatchWorkflow: mockDispatch }));

const { POST } = await import("../../src/app/api/batches/evaluate/route");

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/batches/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/batches/evaluate", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
  });

  it("triggers the GitHub workflow for a batch that hasn't been evaluated yet", async () => {
    mockDispatch.mockResolvedValueOnce(undefined);

    const response = await POST(jsonRequest({ batchName: "Fall 2026" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith("Fall 2026");
  });

  it("refuses to re-trigger a batch within the cooldown window (guards against an accidental double-click)", async () => {
    await upsertBatch(db, "Summer 2026", 54); // lastSyncedAt = now

    const response = await POST(jsonRequest({ batchName: "Summer 2026" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/just triggered/);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("allows re-triggering an already-evaluated batch once the cooldown has passed — re-checking a grown batch is expected, not blocked", async () => {
    const batch = await upsertBatch(db, "Winter 2027", 10);
    // Simulate this batch having been evaluated a while ago, not "just now".
    await db.batch.upsert({
      where: { id: batch.id },
      create: { id: batch.id, displayName: batch.displayName, companyCount: batch.companyCount },
      update: { displayName: batch.displayName, companyCount: batch.companyCount, lastSyncedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    mockDispatch.mockResolvedValueOnce(undefined);

    const response = await POST(jsonRequest({ batchName: "Winter 2027" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith("Winter 2027");
  });

  it("returns 400 for a missing batchName", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const badRequest = new Request("http://localhost/api/batches/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid",
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  it("returns 500 with a clear message if the GitHub dispatch itself fails", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("GITHUB_TOKEN is not set"));
    const response = await POST(jsonRequest({ batchName: "Winter 2027" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/GITHUB_TOKEN/);
  });
});
