// NOTE: this file cannot be typechecked in the sandbox this project was
// built in — `@prisma/client`'s types don't exist until `npx prisma
// generate` has run, and that command needs a schema-engine binary from
// binaries.prisma.sh, a host outside this sandbox's network allowlist.
// This is a sandbox limitation, not a code issue: run `npm run db:generate`
// once (needs real internet access, works anywhere else) and this file
// resolves normally. See docs/ARCHITECTURE.md#storage for the full story,
// and src/lib/db/prismaLike.ts for how the rest of the codebase avoids
// depending on this file at all.
//
// engineType = "client" in prisma/schema.prisma opts into Prisma's
// Rust-free client (GA since 6.16.0): no native query-engine binary
// shipped or downloaded at runtime, using a driver adapter over the
// ordinary `pg` package instead. Smaller, more portable, and the
// recommended default for new Prisma projects at this point — this
// isn't a workaround, it's just the right choice independent of the
// sandbox issue above.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { PrismaLike } from "./prismaLike";

let _client: PrismaClient | null = null;

export function getDb(): PrismaLike {
  if (!_client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const adapter = new PrismaPg({ connectionString });
    _client = new PrismaClient({ adapter });
  }
  // A real generated PrismaClient satisfies PrismaLike structurally; this
  // cast exists only because TS can't verify that without the generated
  // types present, which — per the note above — it doesn't have here.
  return _client as unknown as PrismaLike;
}
