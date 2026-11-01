import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GOODDOLLAR, type DeployEnv } from "@eziokwu/shared";
import type { Config } from "./config";

export function makeClients(c: Pick<Config, "CHAIN_ID" | "RPC_URL" | "RELAYER_PRIVATE_KEY">) {
  const chain = defineChain({
    id: c.CHAIN_ID,
    name: c.CHAIN_ID === 42220 ? "Celo" : `chain-${c.CHAIN_ID}`,
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    rpcUrls: { default: { http: [c.RPC_URL] } },
  });
  const account = privateKeyToAccount(c.RELAYER_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http(c.RPC_URL), pollingInterval: 1000 });
  const walletClient = createWalletClient({ chain, account, transport: http(c.RPC_URL) });
  return { chain, account, publicClient, walletClient };
}

export function gooddollarFor(env: DeployEnv) {
  return GOODDOLLAR[env];
}
