"use client";

import { celo } from "viem/chains";
import { createWalletClient, custom, type WalletClient } from "viem";
import { useAccount } from "wagmi";

/**
 * Signing a message (link, face-verification link) doesn't depend on which chain the wallet is on, but
 * wagmi's own signer insists on switching the wallet to Celo first, which many mobile wallets refuse over
 * WalletConnect. This signs through the connector's provider directly, with no chain switch.
 */
export function useMessageSigner() {
  const { address, connector } = useAccount();
  return async (): Promise<WalletClient> => {
    if (!address || !connector) throw new Error("Connect your wallet first.");
    const provider = (await connector.getProvider()) as { request: (...a: never[]) => Promise<unknown> };
    return createWalletClient({ account: address, chain: celo, transport: custom(provider as never) });
  };
}
