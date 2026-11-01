import { PrismaClient } from "@prisma/client";

export { Prisma, PrismaClient } from "@prisma/client";
export type { Claim, Link, Task, User } from "@prisma/client";
export * from "./tasks";

/** One client per process. Reads DATABASE_URL unless a URL is given. */
export function createDb(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ datasources: { db: { url } } });
}
