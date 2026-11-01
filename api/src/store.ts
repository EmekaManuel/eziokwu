import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";
import type { TaskSpec } from "@eziokwu/shared";

export interface Link {
  telegramId: string;
  address: Address;
  linkedAt: number;
}

/** Persistence used by the API. In-memory here; Stage 4 adds a Postgres/Prisma implementation. */
export interface Store {
  createNonce(telegramId: string): Promise<string>;
  /** Single use: returns true and deletes the nonce if it is valid and unexpired. */
  consumeNonce(telegramId: string, nonce: string): Promise<boolean>;
  getLinkByTelegram(telegramId: string): Promise<Link | undefined>;
  getLinkByAddress(address: Address): Promise<Link | undefined>;
  /**
   * Throws "conflict" if the address is already linked to another Telegram account, or if this
   * Telegram account is linked to a different address and `replace` is false.
   */
  saveLink(link: Link, replace?: boolean): Promise<void>;

  /** Atomically reserves a top-up; returns false if this address already had one or the cap would be exceeded. */
  reserveTopup(address: Address, amountWei: bigint, dailyCapWei: bigint, now: number): Promise<boolean>;
  releaseTopup(address: Address): Promise<void>;
}

/** Content-addressed storage for submission files. Stage 5 adds S3/IPFS behind this interface. */
export interface BlobStore {
  put(hash: Hex, bytes: Uint8Array): Promise<void>;
  has(hash: Hex): Promise<boolean>;
  get(hash: Hex): Promise<Uint8Array | undefined>;
}

const NONCE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class MemoryStore implements Store {
  private nonces = new Map<string, { nonce: string; expires: number }>();
  private byTelegram = new Map<string, Link>();
  private byAddress = new Map<string, Link>();
  private topups = new Map<string, { amount: bigint; at: number }>();

  async createNonce(telegramId: string) {
    const nonce = randomBytes(16).toString("hex");
    this.nonces.set(telegramId, { nonce, expires: Date.now() + NONCE_TTL_MS });
    return nonce;
  }

  async consumeNonce(telegramId: string, nonce: string) {
    const n = this.nonces.get(telegramId);
    if (!n || n.nonce !== nonce || n.expires < Date.now()) return false;
    this.nonces.delete(telegramId);
    return true;
  }

  async getLinkByTelegram(telegramId: string) {
    return this.byTelegram.get(telegramId);
  }
  async getLinkByAddress(address: Address) {
    return this.byAddress.get(address.toLowerCase());
  }
  async saveLink(link: Link, replace = false) {
    const a = link.address.toLowerCase();
    const t = this.byTelegram.get(link.telegramId);
    const o = this.byAddress.get(a);
    if ((t && t.address.toLowerCase() !== a && !replace) || (o && o.telegramId !== link.telegramId)) throw new Error("conflict");
    if (t && t.address.toLowerCase() !== a) this.byAddress.delete(t.address.toLowerCase());
    this.byTelegram.set(link.telegramId, link);
    this.byAddress.set(a, link);
  }

  async reserveTopup(address: Address, amountWei: bigint, dailyCapWei: bigint, now: number) {
    const k = address.toLowerCase();
    if (this.topups.has(k)) return false;
    let recent = 0n;
    for (const t of this.topups.values()) if (now - t.at < DAY_MS) recent += t.amount;
    if (recent + amountWei > dailyCapWei) return false;
    this.topups.set(k, { amount: amountWei, at: now });
    return true;
  }
  async releaseTopup(address: Address) {
    this.topups.delete(address.toLowerCase());
  }
}

export class MemoryBlobStore implements BlobStore {
  private m = new Map<string, Uint8Array>();
  async put(hash: Hex, bytes: Uint8Array) {
    this.m.set(hash.toLowerCase(), bytes);
  }
  async has(hash: Hex) {
    return this.m.has(hash.toLowerCase());
  }
  async get(hash: Hex) {
    return this.m.get(hash.toLowerCase());
  }
}

export interface TaskView {
  bountyId: number;
  specHash: Hex;
  spec: TaskSpec;
}

export type ClaimRecordState = "claimed" | "submitted" | "accepted" | "rejected" | "expired";

/** Task descriptions and our record of who claimed what. */
export interface TaskStore {
  getByBountyId(bountyId: number): Promise<TaskView | undefined>;
  recordClaim(bountyId: number, address: Address, telegramId: string, state: ClaimRecordState): Promise<void>;
}

export class MemoryTaskStore implements TaskStore {
  private tasks = new Map<number, TaskView>();
  readonly claims = new Map<string, { telegramId: string; state: ClaimRecordState }>();
  add(t: TaskView) {
    this.tasks.set(t.bountyId, t);
  }
  async getByBountyId(bountyId: number) {
    return this.tasks.get(bountyId);
  }
  async recordClaim(bountyId: number, address: Address, telegramId: string, state: ClaimRecordState) {
    this.claims.set(`${bountyId}:${address.toLowerCase()}`, { telegramId, state });
  }
}
