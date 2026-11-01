// Standalone bot process (long polling). The API can also run the bot in-process; run only ONE poller per token.
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { createDb } from "@eziokwu/db";
import { DEFAULT_NGN_PER_GD, GOODDOLLAR } from "@eziokwu/shared";
import { createBot, viemChainReader } from "./index";
import { startBot } from "./run";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const env = process.env.DEPLOY_ENV === "prod" ? "prod" : "dev";
const client = createPublicClient({ chain: celo, transport: http(process.env.RPC_URL ?? "https://forno.celo.org") });
const db = createDb(need("DATABASE_URL"));
const chain = viemChainReader(client as never, need("BOUNTY_BOARD") as `0x${string}`, GOODDOLLAR[env].identity as `0x${string}`);
const webAppUrl = need("WEB_APP_URL").replace(/\/$/, "");
const bot = createBot({ token: need("TELEGRAM_BOT_TOKEN"), webAppUrl, db, chain, ngnPerGd: Number(process.env.NGN_PER_GD ?? DEFAULT_NGN_PER_GD) });
await startBot(bot, { db, chain, webAppUrl, nudgeHourUtc: Number(process.env.NUDGE_HOUR_UTC ?? 8) });
