import { GOODDOLLAR, type DeployEnv } from "@eziokwu/shared";
import type { Address } from "viem";

const env = (process.env.NEXT_PUBLIC_DEPLOY_ENV === "prod" ? "prod" : "dev") satisfies DeployEnv;

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787",
  board: (process.env.NEXT_PUBLIC_BOUNTY_BOARD ?? "0x0000000000000000000000000000000000000000") as Address,
  env,
  gd: GOODDOLLAR[env].gd as Address,
  identity: GOODDOLLAR[env].identity as Address,
  rpcUrl: process.env.NEXT_PUBLIC_CELO_RPC_URL ?? "https://forno.celo.org",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  miniAppLink: process.env.NEXT_PUBLIC_MINIAPP_LINK ?? "",
  /** The GoodDollar SDK's environment name for our deploy env. */
  /** GoodDollar's own wallet app per environment (addresses from @goodsdks/citizen-sdk). Fallback place to verify. */
  gooddollarApp: env === "prod" ? "https://wallet.gooddollar.org" : "https://goodid-dev.vercel.app",
  sdkEnv: (env === "prod" ? "production" : "development") as "production" | "development",
};
