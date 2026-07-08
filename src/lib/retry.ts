/**
 * Retries an async function a fixed number of times with a short delay
 * between attempts, before giving up and throwing the last error.
 *
 * Used for scoring calls specifically (see
 * src/lib/pipeline/runBatchPipeline.ts) — the real failure observed in
 * production (a malformed/truncated record_score tool call) is exactly
 * the kind of thing that sometimes succeeds on a second attempt against
 * the same model with the same prompt, without needing a different
 * approach. Not a general-purpose backoff library — no exponential
 * growth, no jitter — because the call sites here are a handful of
 * attempts against a paid API, not a high-volume retry scenario that
 * would need that sophistication.
 */
export async function withRetries<T>(fn: () => Promise<T>, retries: number, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
