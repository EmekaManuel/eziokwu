import { z } from "zod";
import { CELO_CHAIN_ID, DEFAULT_NGN_PER_GD } from "@eziokwu/shared";

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s as `0x${string}`);
const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s as `0x${string}`);

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  CHAIN_ID: z.coerce.number().default(CELO_CHAIN_ID),
  RPC_URL: z.string().url().default("https://forno.celo.org"),
  /** dev = GoodDollar development G$/Identity, prod = production. Must match how the board was deployed. */
  DEPLOY_ENV: z.enum(["dev", "prod"]).default("dev"),
  /** The zero address means "not deployed yet": the API starts, but on-chain features are off. */
  BOUNTY_BOARD: addr,
  /** Hot key that pays gas for claimFor/submitFor. Holds gas money only; it has no authority over bounties. */
  RELAYER_PRIVATE_KEY: key,
  TELEGRAM_BOT_TOKEN: z.string().min(10),
  /** Postgres URL. Unset = in-memory (state is lost on restart; fine for tests only). */
  DATABASE_URL: z.string().url().optional(),
  /** Run the Telegram bot inside this process (long polling). Only ONE process may poll per bot token. */
  BOT_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** Public https address of the Mini App; the bot's buttons open pages under it. Required when BOT_ENABLED. */
  WEB_APP_URL: z.string().url().optional(),
  /** Hour (UTC, 0-23) when the daily "new tasks near you" message goes out. */
  NUDGE_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(8),
  CORS_ORIGIN: z.string().default("*"),
  /** initData older than this is rejected. */
  INITDATA_MAX_AGE_SECONDS: z.coerce.number().default(3600),
  NGN_PER_GD: z.coerce.number().default(DEFAULT_NGN_PER_GD),

  // CELO top-up for the one-time G$ approval. OFF by default; capped when on.
  TOPUP_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  /** CELO sent per verified worker, once per address (e.g. "0.01"). */
  TOPUP_AMOUNT_CELO: z.string().default("0.01"),
  /** Top up only if the worker holds less CELO than this. */
  TOPUP_MIN_BALANCE_CELO: z.string().default("0.005"),
  /** Total CELO the relayer may give away per rolling 24h. */
  TOPUP_DAILY_CAP_CELO: z.string().default("1"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
