import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ThesisProvider, ThesisSnapshot } from "./types";

const DEFAULT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/thesis/current.md"
);

/**
 * Reads the current thesis from a checked-in file rather than a live
 * connector. This is the default until the Activant Research MCP
 * connector's standalone auth is sorted out (see
 * docs/ARCHITECTURE.md#thesis-source) — and stays a perfectly reasonable
 * permanent fallback even after that, since "someone edits a markdown file
 * to update the thesis" has no failure mode a connector doesn't also have.
 *
 * To update: edit docs/thesis/current.md directly. No code change needed.
 */
export class ManualThesisProvider implements ThesisProvider {
  constructor(private filePath: string = DEFAULT_PATH) {}

  async getCurrentThesis(): Promise<ThesisSnapshot> {
    let content: string;
    try {
      content = readFileSync(this.filePath, "utf-8");
    } catch (err) {
      throw new Error(
        `Could not read thesis file at ${this.filePath}. Expected docs/thesis/current.md to exist. (${(err as Error).message})`
      );
    }
    return { source: "manual", summary: content.trim(), fetchedAt: new Date() };
  }
}
