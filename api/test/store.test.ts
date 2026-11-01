import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@eziokwu/db";
import { startTestPostgres } from "../../db/src/testing";
import { MemoryBlobStore, MemoryStore, type BlobStore, type Store } from "../src/store";
import { PgBlobStore, PgStore } from "../src/store-pg";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const C = "0x00000000000000000000000000000000000000c3" as const;
const ETH = 10n ** 18n;

let pg: Awaited<ReturnType<typeof startTestPostgres>>;
let db: ReturnType<typeof createDb>;
beforeAll(async () => {
  pg = await startTestPostgres();
  db = createDb(pg.url);
});
afterAll(async () => {
  await db?.$disconnect();
  pg?.stop();
});

/** The same behaviour is required of every Store, so the two implementations cannot drift apart. */
function contract(name: string, make: () => { store: Store; blobs: BlobStore }) {
  describe(name, () => {
    it("nonces are single-use, per user, and wrong ones fail", async () => {
      const { store } = make();
      const n = await store.createNonce("t1");
      expect(await store.consumeNonce("t1", "wrong")).toBe(false);
      expect(await store.consumeNonce("t2", n)).toBe(false);
      expect(await store.consumeNonce("t1", n)).toBe(true);
      expect(await store.consumeNonce("t1", n)).toBe(false);
    });

    it("only one of two simultaneous uses of a nonce wins", async () => {
      const { store } = make();
      const n = await store.createNonce("race");
      const results = await Promise.all([store.consumeNonce("race", n), store.consumeNonce("race", n), store.consumeNonce("race", n)]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("links are one-to-one and switching wallets frees the old one", async () => {
      const { store } = make();
      const mk = (telegramId: string, address: `0x${string}`) => ({ telegramId, address, linkedAt: Date.now() });
      await store.saveLink(mk("u1", A));
      await store.saveLink(mk("u1", A)); // same pair again is fine
      await expect(store.saveLink(mk("u2", A))).rejects.toThrow("conflict"); // wallet taken
      await expect(store.saveLink(mk("u1", B))).rejects.toThrow("conflict"); // would switch without replace
      await store.saveLink(mk("u1", B), true);
      expect((await store.getLinkByTelegram("u1"))?.address.toLowerCase()).toBe(B);
      expect(await store.getLinkByAddress(A)).toBeUndefined();
      await store.saveLink(mk("u2", A)); // the freed wallet can be linked again
      expect((await store.getLinkByAddress(A))?.telegramId).toBe("u2");
    });

    it("two accounts racing to link one wallet: exactly one wins", async () => {
      const { store } = make();
      const r = await Promise.allSettled(["r1", "r2", "r3"].map((t) => store.saveLink({ telegramId: t, address: C, linkedAt: Date.now() })));
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    });

    it("top-up: once per address, daily cap holds, release frees it", async () => {
      const { store } = make();
      const now = Date.now();
      const cap = 2n * ETH;
      expect(await store.reserveTopup(A, ETH, cap, now)).toBe(true);
      expect(await store.reserveTopup(A, ETH, cap, now)).toBe(false); // same address twice
      expect(await store.reserveTopup(B, ETH, cap, now)).toBe(true);
      expect(await store.reserveTopup(C, ETH, cap, now)).toBe(false); // cap reached
      await store.releaseTopup(B);
      expect(await store.reserveTopup(C, ETH, cap, now)).toBe(true);
      // yesterday's top-ups no longer count toward today's cap
      expect(await store.reserveTopup("0x00000000000000000000000000000000000000d4", ETH, cap, now + 25 * 3600_000)).toBe(true);
    });

    it("simultaneous top-ups cannot exceed the cap", async () => {
      const { store } = make();
      const addrs = Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "e")}` as `0x${string}`);
      const r = await Promise.all(addrs.map((a) => store.reserveTopup(a, ETH, 3n * ETH, Date.now())));
      expect(r.filter(Boolean)).toHaveLength(3);
    });

    it("blobs are content-addressed and idempotent", async () => {
      const { blobs } = make();
      const h = "0x" + "ab".repeat(32);
      expect(await blobs.has(h as `0x${string}`)).toBe(false);
      await blobs.put(h as `0x${string}`, new Uint8Array([1, 2, 3]));
      await blobs.put(h as `0x${string}`, new Uint8Array([1, 2, 3]));
      expect(await blobs.has(h as `0x${string}`)).toBe(true);
      expect([...(await blobs.get(h as `0x${string}`))!]).toEqual([1, 2, 3]);
    });
  });
}

contract("MemoryStore", () => ({ store: new MemoryStore(), blobs: new MemoryBlobStore() }));
contract("PgStore (real Postgres)", () => {
  // Each test starts from empty tables so results do not depend on order.
  return { store: new ResettingPg(), blobs: new PgBlobStore(db) };
});

/** Wipes tables lazily before first use per test instance. */
class ResettingPg extends PgStore {
  private ready: Promise<unknown>;
  constructor() {
    super(db);
    this.ready = db.$transaction([db.nonce.deleteMany(), db.link.deleteMany(), db.topup.deleteMany(), db.blob.deleteMany()]);
  }
  override async createNonce(t: string) { await this.ready; return super.createNonce(t); }
  override async consumeNonce(t: string, n: string) { await this.ready; return super.consumeNonce(t, n); }
  override async saveLink(...a: Parameters<PgStore["saveLink"]>) { await this.ready; return super.saveLink(...a); }
  override async reserveTopup(...a: Parameters<PgStore["reserveTopup"]>) { await this.ready; return super.reserveTopup(...a); }
}
