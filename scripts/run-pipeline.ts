/**
 * Usage:
 *   npm run db:generate                          (once — needs DATABASE_URL and real internet access)
 *   npm run pipeline -- "Summer 2026"             (whole batch)
 *   npm run pipeline -- "Summer 2026" --limit=10  (cap for a cheap smoke test)
 *
 * Runs ingestion + scoring + persistence end to end against a real
 * Postgres database. Needs DATABASE_URL and OPENROUTER_API_KEY set —
 * either exported in your shell, or in a .env file in the project root
 * (copy .env.example, fill in real values; loaded automatically via the
 * `dotenv/config` import above, gitignored so it never gets committed) —
 * and `npm run db:generate` to have been run at least once.
 *
 * If a company fails to score, the run does NOT abort — it's logged and
 * the rest of the batch continues. Safe to re-run the same command
 * afterward; already-scored companies just get re-scored (upsert-based,
 * no duplicates), and the previously-failed ones get another attempt.
 */
import "dotenv/config";
import { getDb } from "../src/lib/db/client";
import { runBatchPipeline } from "../src/lib/pipeline/runBatchPipeline";
import { ManualThesisProvider } from "../src/lib/thesis/manualProvider";

function arg(name: string, args: string[]): string | undefined {
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const args = process.argv.slice(2);
  const batchName = args.find((a) => !a.startsWith("--"));
  if (!batchName) {
    console.error('Usage: npm run pipeline -- "Summer 2026" [--limit=N] [--deep-dive-bar=6.5]');
    process.exit(1);
  }
  const limit = Number(arg("limit", args) ?? Infinity);
  const deepDiveBar = Number(arg("deep-dive-bar", args) ?? 6.5);

  const db = getDb();
  const thesis = await new ManualThesisProvider().getCurrentThesis();

  const result = await runBatchPipeline(db, batchName, thesis, {
    limit,
    deepDiveBar,
    onProgress: (event) => {
      switch (event.type) {
        case "ingesting":
          console.log("Ingesting...");
          break;
        case "ingested":
          console.log(`Got ${event.count} companies.`);
          break;
        case "scoring":
          process.stdout.write(`[${event.index + 1}/${event.total}] ${event.company}... `);
          break;
        case "scored":
          console.log(event.deepDived ? "scored (deep-dive)" : "scored (triage)");
          break;
        case "failed":
          console.log(`FAILED — ${event.error}`);
          break;
        case "done":
          console.log(`\nDone — ${event.count} companies attempted, ${event.failed} failed.`);
          break;
      }
    },
  });

  console.log(`\n${result.processed} companies scored and written to the database.`);
  if (result.failed > 0) {
    console.log(`${result.failed} company/companies failed to score and were skipped:`);
    for (const name of result.failedCompanies) console.log(`  - ${name}`);
    console.log("\nRe-run the same command — already-scored companies will just be re-scored (harmless, upsert-based); the failed ones get another attempt.");
  }
}

main().catch((err) => {
  console.error("Pipeline run failed:", err);
  process.exit(1);
});
