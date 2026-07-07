import type { PrismaLike } from "../db/prismaLike";
import type { ToolDef } from "../ai/openrouter";
import { getCompanyDetail, listBatchesSummary, listTopCompanies, searchCompanies } from "./queryTools";

/**
 * Four narrow query tools over stored data, rather than embeddings/vector
 * search — see queryTools.ts for the reasoning. Claude decides which of
 * these to call and how many times based on the question; this is what
 * lets loosely-phrased questions work without a fixed intent-classifier
 * (docs/ARCHITECTURE.md#chat--qa).
 */
export const CHAT_TOOLS: ToolDef[] = [
  {
    name: "list_batches",
    description:
      "List every YC batch that has been ingested, with display name, company count, and when it was last synced. Call this first if you need to resolve a human-readable batch name (e.g. \"the new batch\", \"Summer 2026\") to a batch id, or to answer a question about what batches exist.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_companies",
    description:
      "Search stored companies by a name, one-liner, industry, or tag substring. Use this to find a specific company from a vague description (e.g. \"the payments one\", \"that robotics startup\") or to list companies matching a theme. Returns compact summaries, not full detail — follow up with get_company for full detail on a specific one.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Pass an empty string to list companies unfiltered (respecting limit/batch_id)." },
        batch_id: { type: "string", description: "Optional. Restrict to one batch (get the id from list_batches)." },
        limit: { type: "number", description: "Optional. Max results, default 15, capped at 50." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_top_companies",
    description:
      "List the highest-scored companies, optionally filtered by category and/or batch. Use this for \"best/most highly ranked/top companies\" style questions. category 'team_general' or 'thesis_fit' filters to companies primarily categorized there and ranks by that specific score; omit or pass 'any' to rank by whichever axis is stronger for each company, across categories.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["team_general", "thesis_fit", "any"], description: "Optional, default 'any'." },
        batch_id: { type: "string", description: "Optional. Restrict to one batch (get the id from list_batches)." },
        limit: { type: "number", description: "Optional. Max results, default 10, capped at 50." },
      },
      required: [],
    },
  },
  {
    name: "get_company",
    description:
      "Get full detail on one company by its slug: description, founders (with bios), website check status, and the full per-dimension rubric breakdown with rationales for both evaluation criteria. Use this once you've identified which company the question is about (via search_companies if the slug isn't already known).",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The company's slug, e.g. \"florin\" — get this from search_companies or list_top_companies if not already known." },
      },
      required: ["slug"],
    },
  },
];

interface SearchCompaniesToolInput {
  query: string;
  batch_id?: string;
  limit?: number;
}
interface ListTopCompaniesToolInput {
  category?: "team_general" | "thesis_fit" | "any";
  batch_id?: string;
  limit?: number;
}
interface GetCompanyToolInput {
  slug: string;
}

/**
 * Runs one tool call against the database and returns a plain object —
 * always an object, never a throw, so a bad/ambiguous tool call from the
 * model degrades to a `{ error }` the model can react to and recover
 * from, rather than blowing up the whole chat turn.
 */
export async function dispatchChatTool(db: PrismaLike, name: string, input: unknown): Promise<unknown> {
  try {
    switch (name) {
      case "list_batches":
        return await listBatchesSummary(db);

      case "search_companies": {
        const i = input as SearchCompaniesToolInput;
        return await searchCompanies(db, { query: i.query, batchId: i.batch_id, limit: i.limit });
      }

      case "list_top_companies": {
        const i = input as ListTopCompaniesToolInput;
        return await listTopCompanies(db, { category: i.category, batchId: i.batch_id, limit: i.limit });
      }

      case "get_company": {
        const i = input as GetCompanyToolInput;
        const detail = await getCompanyDetail(db, i.slug);
        return detail ?? { error: `No company found with slug "${i.slug}". Try search_companies to find the right slug.` };
      }

      default:
        return { error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    return { error: `Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
