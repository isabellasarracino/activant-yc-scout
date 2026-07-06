/**
 * Usage:
 *   npm run score -- "Summer 2026"
 *   npm run score -- "Summer 2026" --limit=10          (cap companies processed, for a quick/cheap smoke test)
 *   npm run score -- "Summer 2026" --deep-dive-bar=7    (only deep-dive companies clearing this on either axis)
 *   npm run score -- "Summer 2026" --out=results.json
 *
 * Phase 2 only: ingests, triages every company, and deep-dives whoever
 * clears the bar. Nothing is persisted to a database yet (Phase 3) — this
 * prints/saves a JSON summary so the rubric and categorization can be
 * sanity-checked against real output before storage/API/frontend get built
 * on top of it.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { ingestBatch } from "../src/lib/yc/ingest";
import { scoreTriage } from "../src/lib/scoring/triage";
import { scoreDeepDive } from "../src/lib/scoring/deepDive";
import { ManualThesisProvider } from "../src/lib/thesis/manualProvider";
import type { ScoreResult } from "../src/lib/scoring/types";
import type { NormalizedCompany } from "../src/lib/yc/types";

function arg(name: string, args: string[]): string | undefined {
  return args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const args = process.argv.slice(2);
  const batchName = args.find((a) => !a.startsWith("--"));
  if (!batchName) {
    console.error('Usage: npm run score -- "Summer 2026" [--limit=N] [--deep-dive-bar=6.5] [--out=path.json]');
    process.exit(1);
  }
  const limit = Number(arg("limit", args) ?? Infinity);
  const deepDiveBar = Number(arg("deep-dive-bar", args) ?? 6.5);
  const outPath = arg("out", args);

  console.log(`Ingesting "${batchName}"...`);
  const allCompanies = await ingestBatch(batchName);
  const companies = allCompanies.slice(0, limit);
  console.log(`Got ${allCompanies.length} companies${limit < allCompanies.length ? `, processing first ${limit}` : ""}.`);

  const thesis = await new ManualThesisProvider().getCurrentThesis();
  console.log(`Using thesis from: ${thesis.source} (${thesis.summary.length} chars)\n`);

  const results: { company: NormalizedCompany; score: ScoreResult }[] = [];

  for (const [i, company] of companies.entries()) {
    process.stdout.write(`[${i + 1}/${companies.length}] Triaging ${company.name}... `);
    const triage = await scoreTriage({ company, thesis });
    const needsDeepDive = triage.teamGeneralScore >= deepDiveBar || triage.thesisAlignScore >= deepDiveBar;

    if (!needsDeepDive) {
      console.log(`done (team ${triage.teamGeneralScore}, thesis ${triage.thesisAlignScore}) — below deep-dive bar`);
      results.push({ company, score: triage });
      continue;
    }

    process.stdout.write(`clears bar (team ${triage.teamGeneralScore}, thesis ${triage.thesisAlignScore}), deep-diving... `);
    const deepDive = await scoreDeepDive({ company, thesis });
    console.log(`done (team ${deepDive.teamGeneralScore}, thesis ${deepDive.thesisAlignScore})`);
    results.push({ company, score: deepDive });
  }

  const byCategory = {
    team_general: results.filter((r) => r.score.primaryCategory === "team_general"),
    thesis_fit: results.filter((r) => r.score.primaryCategory === "thesis_fit"),
    neither: results.filter((r) => r.score.primaryCategory === null),
  };

  console.log("\n=== Summary ===");
  console.log(`Team & General Interest: ${byCategory.team_general.length}`);
  console.log(`Activant Thesis Fit:     ${byCategory.thesis_fit.length}`);
  console.log(`Below bar on both:       ${byCategory.neither.length}`);
  const secondaryHits = results.filter((r) => r.score.secondaryTag).length;
  console.log(`(of which ${secondaryHits} are also flagged strong on the other axis)`);

  for (const [label, group] of Object.entries(byCategory)) {
    if (label === "neither" || group.length === 0) continue;
    console.log(`\n--- ${label} ---`);
    for (const r of group.sort((a, b) => Math.max(b.score.teamGeneralScore, b.score.thesisAlignScore) - Math.max(a.score.teamGeneralScore, a.score.thesisAlignScore))) {
      const tag = r.score.secondaryTag ? " [also strong on the other axis]" : "";
      console.log(`  ${r.company.name} — team ${r.score.teamGeneralScore}, thesis ${r.score.thesisAlignScore}${tag}`);
      console.log(`    ${r.score.summary}`);
    }
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\nFull results written to ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Scoring run failed:", err);
  process.exit(1);
});
