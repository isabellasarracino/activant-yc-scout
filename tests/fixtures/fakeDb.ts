import type { PrismaLike } from "../../src/lib/db/prismaLike";
import type { BatchRow, CompanyRow, CompanyScoreRow, CompanyWithRelations, FounderRow } from "../../src/lib/db/types";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

/**
 * A minimal in-memory relational store implementing exactly PrismaLike —
 * real upsert/relational-query semantics (not just recorded calls), so
 * tests exercise the same logic the repository layer actually relies on
 * (e.g. "upserting a company twice doesn't create a duplicate row").
 * Deliberately not shared/reset between test files via a singleton — each
 * test constructs its own with `createFakeDb()` for isolation.
 */
export function createFakeDb(): PrismaLike {
  const batches = new Map<string, BatchRow>();
  const companies = new Map<string, CompanyRow>();
  const founders = new Map<string, FounderRow>();
  const scores = new Map<string, CompanyScoreRow & { companyId: string }>();

  const hydrate = (company: CompanyRow): CompanyWithRelations => ({
    ...company,
    founders: [...founders.values()].filter((f) => f.companyId === company.id),
    score: scores.get(company.id) ?? null,
  });

  const db: PrismaLike = {
    batch: {
      async upsert({ where, create, update }) {
        const existing = batches.get(where.id);
        const row: BatchRow = existing
          ? { ...existing, ...update }
          : { ...create, firstSyncedAt: new Date(), lastSyncedAt: new Date() };
        batches.set(row.id, row);
        return row;
      },
      async findMany(args) {
        const all = [...batches.values()];
        if (args?.orderBy?.lastSyncedAt === "desc") {
          all.sort((a, b) => b.lastSyncedAt.getTime() - a.lastSyncedAt.getTime());
        }
        return all;
      },
    },
    company: {
      async upsert({ where, create, update }) {
        const existing = [...companies.values()].find((c) => c.slug === where.slug);
        const row: CompanyRow = existing ? { ...existing, ...update } : { ...create, id: nextId("company") };
        companies.set(row.id, row);
        return row;
      },
      async update({ where, data }) {
        const existing = companies.get(where.id);
        if (!existing) throw new Error(`No company with id ${where.id}`);
        const row = { ...existing, ...data };
        companies.set(row.id, row);
        return row;
      },
      async findUnique({ where }) {
        const row = [...companies.values()].find((c) => c.slug === where.slug);
        return row ? hydrate(row) : null;
      },
      async findMany(args) {
        const all = [...companies.values()];
        const filtered = args.where ? all.filter((c) => c.batchId === args.where!.batchId) : all;
        return filtered.map(hydrate);
      },
    },
    founder: {
      async deleteMany({ where }) {
        const toDelete = [...founders.values()].filter((f) => f.companyId === where.companyId);
        for (const f of toDelete) founders.delete(f.id);
        return { count: toDelete.length };
      },
      async createMany({ data }) {
        for (const f of data) {
          const id = nextId("founder");
          founders.set(id, { ...f, id });
        }
        return { count: data.length };
      },
    },
    companyScore: {
      async upsert({ where, create, update }) {
        const existing = scores.get(where.companyId);
        const row = existing ? { ...existing, ...update } : { ...create };
        scores.set(where.companyId, row);
        return row;
      },
    },
    async $transaction(fn) {
      // No real isolation needed for an in-memory fake — the point of a
      // transaction here (all-or-nothing on failure) doesn't need
      // simulating for what these tests check.
      return fn(db);
    },
  };

  return db;
}
