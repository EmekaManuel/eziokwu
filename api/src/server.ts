import { GOODDOLLAR, bountyBoardAbi } from "@eziokwu/shared";
import { buildApp } from "./app";
import { makeClients } from "./clients";
import { loadConfig } from "./config";
import { Relayer, topupPolicyFrom } from "./relayer";
import { createBot, startBot, viemChainReader } from "@eziokwu/bot";
import { createDb, type PrismaClient } from "@eziokwu/db";
import { MemoryBlobStore, MemoryStore, MemoryTaskStore, type BlobStore, type Store, type TaskStore } from "./store";
import { PgBlobStore, PgStore, PgTaskStore } from "./store-pg";

const config = loadConfig();
const { publicClient, walletClient } = makeClients(config);
const { gd, identity } = GOODDOLLAR[config.DEPLOY_ENV];

const deployed = !/^0x0{40}$/.test(config.BOUNTY_BOARD);
if (deployed) {
  // Fail fast if the board was deployed against different G$/Identity than DEPLOY_ENV says.
  const [boardGd, boardIdentity] = await Promise.all([
    publicClient.readContract({ address: config.BOUNTY_BOARD, abi: bountyBoardAbi, functionName: "gd" }),
    publicClient.readContract({ address: config.BOUNTY_BOARD, abi: bountyBoardAbi, functionName: "identity" }),
  ]);
  if (boardGd.toLowerCase() !== gd.toLowerCase() || boardIdentity.toLowerCase() !== identity.toLowerCase()) {
    throw new Error(`BountyBoard ${config.BOUNTY_BOARD} uses different G$/Identity than DEPLOY_ENV=${config.DEPLOY_ENV}`);
  }
} else {
  console.warn("BOUNTY_BOARD is the zero address: running in PRE-DEPLOY mode. Linking works; claims, status reads and top-ups need a deployed board.");
}

let db: PrismaClient | undefined;
let store: Store;
let blobs: BlobStore;
let tasks: TaskStore;
if (config.DATABASE_URL) {
  db = createDb(config.DATABASE_URL);
  await db.$queryRaw`SELECT 1`; // fail fast if the database is unreachable
  store = new PgStore(db);
  blobs = new PgBlobStore(db);
  tasks = new PgTaskStore(db);
} else {
  console.warn("DATABASE_URL is not set: using in-memory storage. Links and answers are lost on restart.");
  store = new MemoryStore();
  blobs = new MemoryBlobStore();
  tasks = new MemoryTaskStore();
}
const relayer = new Relayer({ publicClient, walletClient, board: config.BOUNTY_BOARD, gd, identity, store, topup: topupPolicyFrom(config) });
const app = await buildApp({ config, store, blobs, tasks, relayer, publicClient, board: config.BOUNTY_BOARD, boardDeployed: deployed });

await app.listen({ port: config.PORT, host: "0.0.0.0" });
console.log(`api on :${config.PORT}; relayer ${relayer.address}; env ${config.DEPLOY_ENV}; topup ${config.TOPUP_ENABLED ? "ON" : "off"}`);

if (config.BOT_ENABLED) {
  if (!db) throw new Error("BOT_ENABLED needs DATABASE_URL");
  if (!config.WEB_APP_URL) throw new Error("BOT_ENABLED needs WEB_APP_URL");
  if (!deployed) throw new Error("BOT_ENABLED needs a deployed BOUNTY_BOARD");
  const webAppUrl = config.WEB_APP_URL.replace(/\/$/, "");
  const chain = viemChainReader(publicClient, config.BOUNTY_BOARD, identity);
  const bot = createBot({ token: config.TELEGRAM_BOT_TOKEN, webAppUrl, db, chain, ngnPerGd: config.NGN_PER_GD });
  await startBot(bot, { db, chain, webAppUrl, nudgeHourUtc: config.NUDGE_HOUR_UTC });
}
