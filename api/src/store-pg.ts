import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@eziokwu/db";
import type { Address, Hex } from "viem";
import type { BlobStore, ClaimRecordState, Link, Store, TaskStore, TaskView } from "./store";

const NONCE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Arbitrary constant: serializes top-up reservations so the daily cap cannot be raced past. */
const TOPUP_LOCK = 7_001;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Postgres-backed Store. Behaves exactly like MemoryStore; the shared contract test runs against both. */
export class PgStore implements Store {
  constructor(private db: PrismaClient) {}

  async createNonce(telegramId: string) {
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    await this.db.nonce.upsert({ where: { telegramId }, create: { telegramId, nonce, expiresAt }, update: { nonce, expiresAt } });
    return nonce;
  }

  async consumeNonce(telegramId: string, nonce: string) {
    // One atomic delete: only one caller can ever get count 1 for a given nonce.
    const { count } = await this.db.nonce.deleteMany({ where: { telegramId, nonce, expiresAt: { gt: new Date() } } });
    return count === 1;
  }

  private toLink(r: { telegramId: string; address: string; linkedAt: Date }): Link {
    return { telegramId: r.telegramId, address: r.address as Address, linkedAt: r.linkedAt.getTime() };
  }
  async getLinkByTelegram(telegramId: string) {
    const r = await this.db.link.findUnique({ where: { telegramId } });
    return r ? this.toLink(r) : undefined;
  }
  async getLinkByAddress(address: Address) {
    const r = await this.db.link.findUnique({ where: { address: address.toLowerCase() } });
    return r ? this.toLink(r) : undefined;
  }

  async saveLink(link: Link, replace = false) {
    const address = link.address.toLowerCase();
    try {
      await this.db.$transaction(async (tx) => {
        const t = await tx.link.findUnique({ where: { telegramId: link.telegramId } });
        const o = await tx.link.findUnique({ where: { address } });
        if (o && o.telegramId !== link.telegramId) throw new Error("conflict");
        if (t && t.address !== address && !replace) throw new Error("conflict");
        const linkedAt = new Date(link.linkedAt);
        await tx.link.upsert({ where: { telegramId: link.telegramId }, create: { telegramId: link.telegramId, address, linkedAt }, update: { address, linkedAt } });
      });
    } catch (e) {
      // The unique index on address catches two simultaneous links of the same wallet.
      throw isUniqueViolation(e) ? new Error("conflict") : e;
    }
  }

  async reserveTopup(address: Address, amountWei: bigint, dailyCapWei: bigint, now: number) {
    const key = address.toLowerCase();
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TOPUP_LOCK})`;
      if (await tx.topup.findUnique({ where: { address: key } })) return false;
      const recent = await tx.topup.aggregate({ _sum: { amountWei: true }, where: { createdAt: { gte: new Date(now - DAY_MS) } } });
      if ((recent._sum.amountWei ?? 0n) + amountWei > dailyCapWei) return false;
      await tx.topup.create({ data: { address: key, amountWei, createdAt: new Date(now) } });
      return true;
    });
  }
  async releaseTopup(address: Address) {
    await this.db.topup.deleteMany({ where: { address: address.toLowerCase() } });
  }
}

export class PgBlobStore implements BlobStore {
  constructor(private db: PrismaClient) {}
  async put(hash: Hex, bytes: Uint8Array) {
    const key = hash.toLowerCase();
    // Content-addressed: the same hash always means the same bytes, so a repeat write changes nothing.
    await this.db.blob.upsert({ where: { hash: key }, create: { hash: key, bytes: Buffer.from(bytes) }, update: {} });
  }
  async has(hash: Hex) {
    return (await this.db.blob.count({ where: { hash: hash.toLowerCase() } })) > 0;
  }
  async get(hash: Hex) {
    const r = await this.db.blob.findUnique({ where: { hash: hash.toLowerCase() } });
    return r ? new Uint8Array(r.bytes) : undefined;
  }
}

export class PgTaskStore implements TaskStore {
  constructor(private db: PrismaClient) {}
  async getByBountyId(bountyId: number): Promise<TaskView | undefined> {
    const t = await this.db.task.findUnique({ where: { bountyId } });
    if (!t || t.bountyId === null) return undefined;
    return {
      bountyId: t.bountyId,
      specHash: t.specHash as Hex,
      spec: { kind: "price", title: t.title, description: t.description, item: t.item, unit: t.unit, currency: t.currency, marketName: t.marketName, city: t.city, lat: t.lat, lng: t.lng, radiusM: t.radiusM },
    };
  }
  async recordClaim(bountyId: number, address: Address, telegramId: string, state: ClaimRecordState) {
    const a = address.toLowerCase();
    await this.db.claim.upsert({ where: { bountyId_address: { bountyId, address: a } }, create: { bountyId, address: a, telegramId, state }, update: { state } });
  }
}
