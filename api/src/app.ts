import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { isAddress, recoverMessageAddress, stringToBytes, type Address, type Chain, type PublicClient, type Transport } from "viem";
import { bountyBoardAbi, canonicalSubmission, hashBytes, linkMessage, type SubmissionPayload } from "@eziokwu/shared";
import type { Config } from "./config";
import { RelayError, type Relayer } from "./relayer";
import { verifyInitData, type TelegramUser } from "./telegram";
import { MemoryTaskStore, type BlobStore, type Store, type TaskStore } from "./store";

export interface AppDeps {
  config: Pick<Config, "TELEGRAM_BOT_TOKEN" | "INITDATA_MAX_AGE_SECONDS" | "CORS_ORIGIN" | "NGN_PER_GD" | "TOPUP_ENABLED">;
  store: Store;
  blobs: BlobStore;
  /** Task descriptions and claim records. Defaults to an empty in-memory store. */
  tasks?: TaskStore;
  relayer: Relayer;
  publicClient: PublicClient<Transport, Chain>;
  board: Address;
  /** False before the contract is deployed: /v1/me then reports link status only. */
  boardDeployed?: boolean;
  /** Per-IP rate limits. Default true; the integration tests share one IP and switch it off. */
  rateLimit?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    tg?: TelegramUser;
  }
}

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s as `0x${string}`);
const sig = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((s) => s as `0x${string}`);
const uint = z.string().regex(/^\d{1,30}$/).transform((s) => BigInt(s));
const address = z.string().refine((s) => isAddress(s), "bad address").transform((s) => s as Address);

const MAX_SUBMISSION_BYTES = 4096;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const d = { ...deps, tasks: deps.tasks ?? new MemoryTaskStore() };
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  await app.register(cors, { origin: d.config.CORS_ORIGIN === "*" ? true : d.config.CORS_ORIGIN.split(",") });
  if (d.rateLimit !== false) await app.register(rateLimit, { global: true, max: 120, timeWindow: "1 minute" });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof RelayError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "bad_request", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: "bad_request", message: e.message });
    app.log.error(err);
    return reply.status(500).send({ error: "internal" });
  });

  // Every /v1 route requires valid Telegram Mini App initData in a header.
  app.addHook("preHandler", async (req: FastifyRequest) => {
    if (!req.url.startsWith("/v1/")) return;
    const initData = req.headers["x-telegram-init-data"];
    if (typeof initData !== "string") throw new RelayError("unauthorized", "missing Telegram initData", 401);
    try {
      req.tg = verifyInitData(initData, d.config.TELEGRAM_BOT_TOKEN, d.config.INITDATA_MAX_AGE_SECONDS);
    } catch (e) {
      throw new RelayError("unauthorized", (e as Error).message, 401);
    }
  });

  async function requireLink(req: FastifyRequest) {
    const link = await d.store.getLinkByTelegram(req.tg!.id);
    if (!link) throw new RelayError("not_linked", "link your wallet first", 403);
    return link;
  }

  app.get("/health", async () => ({ ok: true }));

  // --- wallet linking -------------------------------------------------------------------------
  app.get("/v1/link/nonce", async (req) => {
    return { nonce: await d.store.createNonce(req.tg!.id) };
  });

  app.post("/v1/link", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const body = z.object({ address, nonce: z.string().min(8).max(64), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).parse(req.body);
    const message = linkMessage(req.tg!.id, body.nonce);
    let recovered: Address;
    try {
      recovered = await recoverMessageAddress({ message, signature: body.signature as `0x${string}` });
    } catch {
      throw new RelayError("bad_signature", "could not read signature");
    }
    if (recovered.toLowerCase() !== body.address.toLowerCase()) throw new RelayError("bad_signature", "signature does not match address");
    if (!(await d.store.consumeNonce(req.tg!.id, body.nonce))) throw new RelayError("bad_nonce", "nonce expired or already used");
    try {
      await d.store.saveLink({ telegramId: req.tg!.id, address: body.address, linkedAt: Date.now() }, true);
    } catch {
      throw new RelayError("link_conflict", "this Telegram account or wallet is already linked to another", 409);
    }
    return { linked: true, address: body.address };
  });

  // --- worker status --------------------------------------------------------------------------
  app.get("/v1/me", async (req) => {
    const link = await d.store.getLinkByTelegram(req.tg!.id);
    if (!link) return { linked: false };
    if (d.boardDeployed === false) {
      const { root, verified } = await d.relayer.identityRoot(link.address);
      return { linked: true, address: link.address, root, verified, approved: false, predeploy: true, ngnPerGd: d.config.NGN_PER_GD };
    }
    const s = await d.relayer.workerState(link.address);
    return {
      linked: true,
      address: link.address,
      root: s.root,
      verified: s.verified,
      approved: s.allowance > 0n,
      allowance: s.allowance.toString(),
      celoBalance: s.celo.toString(),
      nonce: s.nonce.toString(),
      tier: s.tier,
      topupAvailable: d.config.TOPUP_ENABLED,
      ngnPerGd: d.config.NGN_PER_GD,
    };
  });

  app.post("/v1/topup", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req) => {
    const link = await requireLink(req);
    const r = await d.relayer.topupForApproval(link.address);
    return { hash: r.hash, amountWei: r.amountWei.toString() };
  });

  // --- task descriptions: the text behind a bounty's on-chain specHash --------------------------
  app.get("/v1/tasks/:bountyId", async (req) => {
    const { bountyId } = z.object({ bountyId: z.string().regex(/^\d{1,9}$/) }).parse(req.params);
    const task = await d.tasks.getByBountyId(Number(bountyId));
    if (!task) throw new RelayError("not_found", "no description for this task", 404);
    return task;
  });

  // --- submissions (off-chain answer; the on-chain hash is keccak256 of exactly these bytes) ----
  app.post("/v1/submissions", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const link = await requireLink(req);
    const body = z
      .object({
        payload: z.object({
          v: z.literal(1),
          bountyId: z.string().regex(/^\d{1,30}$/),
          worker: address,
          answer: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])),
          capturedAt: z.number().int().positive(),
        }),
      })
      .parse(req.body);
    const payload = body.payload as SubmissionPayload;
    if (payload.worker.toLowerCase() !== link.address.toLowerCase()) throw new RelayError("wrong_worker", "payload worker is not your linked wallet", 403);

    // Only store answers for slots the worker actually holds.
    const claim = await d.publicClient.readContract({ address: d.board, abi: bountyBoardAbi, functionName: "claims", args: [BigInt(payload.bountyId), link.address] });
    if (claim[0] !== 1) throw new RelayError("not_claimed", "claim the task before submitting", 409);

    const canonical = canonicalSubmission(payload);
    const bytes = stringToBytes(canonical);
    if (bytes.length > MAX_SUBMISSION_BYTES) throw new RelayError("too_large", "answer too large");
    const submissionHash = hashBytes(bytes);
    await d.blobs.put(submissionHash, bytes);
    return { submissionHash, canonical };
  });

  // --- gasless relay: the worker's EIP-712 signature is the only authority -----------------------
  app.post("/v1/relay/claim", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const link = await requireLink(req);
    const b = z.object({ bountyId: uint, deadline: uint, signature: sig }).parse(req.body);
    const hash = await d.relayer.claimFor(b.bountyId, link.address, b.deadline, b.signature);
    await d.tasks.recordClaim(Number(b.bountyId), link.address, link.telegramId, "claimed");
    return { hash };
  });

  app.post("/v1/relay/submit", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const link = await requireLink(req);
    const b = z.object({ bountyId: uint, submissionHash: hex32, deadline: uint, signature: sig }).parse(req.body);
    // The hash stored on-chain must correspond to a file we hold.
    if (!(await d.blobs.has(b.submissionHash))) throw new RelayError("unknown_submission", "upload the answer first", 409);
    const hash = await d.relayer.submitFor(b.bountyId, link.address, b.submissionHash, b.deadline, b.signature);
    await d.tasks.recordClaim(Number(b.bountyId), link.address, link.telegramId, "submitted");
    return { hash };
  });

  return app;
}
