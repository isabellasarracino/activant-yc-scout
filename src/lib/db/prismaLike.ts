import type { BatchRow, CompanyRow, CompanyScoreRow, CompanyWithRelations, FounderRow } from "./types";

/**
 * The exact slice of PrismaClient's shape the repository layer needs.
 * Hand-written rather than imported from `@prisma/client`, for two
 * reasons — one general, one specific to how this got built:
 *
 * General: a narrow, hand-owned interface is easier to test (a plain mock
 * object satisfies it, no Prisma test-double library needed) and makes the
 * repository's actual dependencies explicit rather than "all of Prisma."
 *
 * Specific: `@prisma/client`'s real types don't exist until `npx prisma
 * generate` has run, and that command needs a schema-engine binary from
 * binaries.prisma.sh — a host this sandbox's network allowlist doesn't
 * cover (confirmed directly: `prisma generate` fails on a 403 fetching
 * that binary, independent of the newer Rust-free "driver adapter" client
 * mode, which only removes the *runtime* query engine, not the CLI's
 * schema-engine dependency). See docs/ARCHITECTURE.md#storage.
 *
 * A real generated PrismaClient satisfies this interface structurally —
 * nothing here needs to change once `prisma generate` runs somewhere with
 * normal internet access. `src/lib/db/client.ts` is the one file that
 * couldn't be typechecked in this environment as a result; everything
 * downstream of this interface could be, and was.
 */
export interface PrismaLike {
  batch: {
    upsert(args: {
      where: { id: string };
      create: { id: string; displayName: string; companyCount: number | null };
      update: { displayName: string; companyCount: number | null; lastSyncedAt: Date };
    }): Promise<BatchRow>;
    findMany(args?: { orderBy?: { lastSyncedAt: "asc" | "desc" } }): Promise<BatchRow[]>;
  };
  company: {
    upsert(args: {
      where: { slug: string };
      create: Omit<CompanyRow, "id">;
      update: Partial<Omit<CompanyRow, "id" | "slug" | "batchId">>;
    }): Promise<CompanyRow>;
    update(args: {
      where: { id: string };
      data: Partial<Omit<CompanyRow, "id" | "slug" | "batchId">>;
    }): Promise<CompanyRow>;
    findUnique(args: {
      where: { slug: string };
      include: { founders: true; score: true };
    }): Promise<CompanyWithRelations | null>;
    findMany(args: {
      /**
       * Omit entirely to get every company across every batch — added in
       * Phase 3b for chat/search, which need to reason across the whole
       * dataset (e.g. "what's the best company across all batches"), not
       * one batch at a time. Real Prisma's `findMany` already returns all
       * rows when `where` is omitted, so this costs nothing structurally.
       */
      where?: { batchId: string };
      include: { founders: true; score: true };
    }): Promise<CompanyWithRelations[]>;
  };
  founder: {
    deleteMany(args: { where: { companyId: string } }): Promise<{ count: number }>;
    createMany(args: { data: Omit<FounderRow, "id">[] }): Promise<{ count: number }>;
  };
  companyScore: {
    upsert(args: {
      where: { companyId: string };
      create: CompanyScoreRow & { companyId: string };
      update: Partial<CompanyScoreRow>;
    }): Promise<CompanyScoreRow>;
  };
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
}
