import { PrismaClient } from "@prisma/client";
import type { PrismaLike } from "./prismaLike";

let _client: PrismaClient | null = null;

export function getDb(): PrismaLike {
  if (!_client) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _client = new PrismaClient();
  }
  return _client as unknown as PrismaLike;
}