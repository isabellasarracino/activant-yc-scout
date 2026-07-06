/**
 * Usage:
 *   npm run ingest -- "Summer 2026"
 *   npm run ingest -- "Summer 2026" --fast   (skip founder extraction, just YC metadata)
 *   npm run ingest -- "Summer 2026" --out=out.json
 *
 * This is Phase 1 only: it fetches + normalizes a batch and prints/saves it.
 * It does not score anything or write to the database yet — that's Phase 2,
 * once the scoring rubric is wired up (see docs/ARCHITECTURE.md#roadmap).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { ingestBatch } from "../src/lib/yc/ingest";

async function main() {
  const args = process.argv.slice(2);
  const batchName = args.find((a) => !a.startsWith("--"));
  if (!batchName) {
    console.error('Usage: npm run ingest -- "Summer 2026" [--fast] [--out=path.json]');
    process.exit(1);
  }
  const fast = args.includes("--fast");
  const outArg = args.find((a) => a.startsWith("--out="));
  const outPath = outArg ? outArg.split("=")[1] : undefined;

  console.log(`Ingesting "${batchName}"${fast ? " (fast: YC metadata only, no founder pages)" : ""}...`);
  const started = Date.now();
  const companies = await ingestBatch(batchName, { skipFounderExtraction: fast });
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  const withFounders = companies.filter((c) => c.founders.length > 0).length;
  const degraded = companies.filter((c) => c.founderExtractionNote).length;

  console.log(`\nDone in ${elapsedSec}s — ${companies.length} companies`);
  console.log(`  with founder data extracted: ${withFounders}`);
  console.log(`  degraded to YC-data-only:    ${degraded}`);
  if (degraded > 0) {
    console.log("\nDegraded companies (see founderExtractionNote for why):");
    for (const c of companies.filter((c) => c.founderExtractionNote)) {
      console.log(`  - ${c.name}: ${c.founderExtractionNote}`);
    }
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(companies, null, 2));
    console.log(`\nWrote full output to ${outPath}`);
  } else {
    console.log("\nFirst company as a sample:");
    console.log(JSON.stringify(companies[0], null, 2));
  }
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
