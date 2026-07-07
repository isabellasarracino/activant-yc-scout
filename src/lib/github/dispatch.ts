/**
 * Triggers the "Score YC Batch" GitHub Actions workflow via GitHub's REST
 * API. Scoring 150-300 companies takes far longer than a Vercel
 * serverless function is allowed to run, so the website can't do the
 * scoring itself — it asks GitHub to run it instead. See
 * .github/workflows/score-batch.yml for the actual job, and
 * docs/ARCHITECTURE.md#website-triggered-evaluation for the full
 * mechanism.
 *
 * Needs GITHUB_TOKEN (a Personal Access Token with Actions read/write
 * access to this repo) and GITHUB_REPOSITORY ("owner/repo") as
 * environment variables — set these in Vercel, not GitHub. This is a
 * different credential store than what the workflow itself needs
 * (DATABASE_URL/OPENROUTER_API_KEY as GitHub Actions *repository
 * secrets*, since the workflow runs on GitHub's infrastructure): this
 * token's only job is asking GitHub to start the job, not running it.
 *
 * GitHub's workflow-dispatch endpoint returns 204 No Content with no run
 * ID on success — there's no way to get "the run that was just created"
 * back from this call directly. Deliberately not solved by polling
 * GitHub's list-runs API to guess which one is ours; the website instead
 * tracks progress by polling its own database (GET /api/batches/[batch])
 * for companies actually appearing, which is simpler and answers the
 * question that actually matters ("is data showing up") rather than a
 * proxy for it ("did GitHub say the job started").
 */
export async function dispatchScoreBatchWorkflow(batchName: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY; // "owner/repo"
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  if (!repository) throw new Error('GITHUB_REPOSITORY is not set (expected "owner/repo")');

  const res = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/score-batch.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { batch_name: batchName } }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GitHub workflow dispatch failed: HTTP ${res.status}${detail ? ` — ${detail}` : ""}. Check GITHUB_TOKEN has Actions write access to this repo, and that .github/workflows/score-batch.yml exists on the "main" branch.`
    );
  }
}
