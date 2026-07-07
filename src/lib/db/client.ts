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
// Uses Prisma's standard binary Query Engine (the classic, most
// heavily-supported setup on Vercel), not the newer WASM "client" engine
// mode or a driver adapter — an earlier version of this file used both,
// on the theory that no-native-binary was strictly better. In practice,
// the WASM query-compiler engine has a widely-reported, still-open bug
// (as of mid-2026) where its .wasm file doesn't get bundled correctly by
// Next.js's file tracing on Vercel, surfacing as
// "ENOENT: .../query_compiler_bg.wasm" at runtime — confirmed by hitting
// it on this project's actual first deployment. `binaryTargets` includes
// "rhel-openssl-3.0.x" for Vercel's Linux serverless runtime alongside
// "native" for local development.
import { PrismaClient } from "@prisma/client";
import type { PrismaLike } from "./prismaLike";

let _client: PrismaClient | null = null;

export function getDb(): PrismaLike {
  if (!_client) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _client = new PrismaClient();
  }
  // A real generated PrismaClient satisfies PrismaLike structurally; this
  // cast exists only because TS can't verify that without the generated
  // types present, which — per the note above — it doesn't have here.
  return _client as unknown as PrismaLike;
}
