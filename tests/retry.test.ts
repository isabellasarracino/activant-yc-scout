import { describe, expect, it, vi } from "vitest";
import { withRetries } from "../src/lib/retry";

describe("withRetries", () => {
  it("returns the result on the first try if it succeeds, without waiting or retrying", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const result = await withRetries(fn, 2, 0);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure and returns the result once it succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("first attempt failed")).mockResolvedValueOnce("ok");
    const result = await withRetries(fn, 2, 0);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("makes exactly retries+1 attempts total before giving up", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetries(fn, 2, 0)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("throws the LAST error, not the first, when every attempt fails", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"));
    await expect(withRetries(fn, 1, 0)).rejects.toThrow("error 2");
  });

  it("makes exactly one attempt when retries is 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetries(fn, 0, 0)).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
