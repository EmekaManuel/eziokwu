import type { Address, Chain, PublicClient, Transport } from "viem";
import { bountyBoardAbi, identityAbi } from "@eziokwu/shared";

export interface BountyInfo {
  reward: bigint;
  feeBps: number;
  bond: bigint;
  answersNeeded: number;
  minTier: number;
  deadline: bigint;
  /** Slots still claimable right now (0 after the deadline). */
  openSlots: number;
}

export interface WorkerInfo {
  /** Null when the wallet is not GoodDollar-verified. */
  root: Address | null;
  tier: number;
  accepted: number;
  rejected: number;
}

/** The few chain reads the bot needs. A small interface so tests can fake the chain. */
export interface ChainReader {
  bounties(ids: number[]): Promise<Map<number, BountyInfo>>;
  /** 0 none, 1 claimed, 2 submitted, 3 accepted, 4 rejected, 5 expired */
  claimState(bountyId: number, worker: Address): Promise<number>;
  worker(address: Address): Promise<WorkerInfo>;
}

const ZERO = /^0x0{40}$/;

export function viemChainReader(client: PublicClient<Transport, Chain>, board: Address, identity: Address): ChainReader {
  return {
    async bounties(ids) {
      const out = new Map<number, BountyInfo>();
      await Promise.all(
        ids.map(async (id) => {
          const [b, openSlots] = await Promise.all([
            client.readContract({ address: board, abi: bountyBoardAbi, functionName: "bounties", args: [BigInt(id)] }),
            client.readContract({ address: board, abi: bountyBoardAbi, functionName: "openSlots", args: [BigInt(id)] }),
          ]);
          if (ZERO.test(b[0])) return;
          out.set(id, { feeBps: b[1], answersNeeded: b[2], minTier: b[3], deadline: b[7], reward: b[8], bond: b[9], openSlots });
        }),
      );
      return out;
    },
    async claimState(bountyId, worker) {
      const c = await client.readContract({ address: board, abi: bountyBoardAbi, functionName: "claims", args: [BigInt(bountyId), worker] });
      return c[0];
    },
    async worker(address) {
      const root = await client.readContract({ address: identity, abi: identityAbi, functionName: "getWhitelistedRoot", args: [address] });
      if (ZERO.test(root)) return { root: null, tier: 0, accepted: 0, rejected: 0 };
      const [tier, stats] = await Promise.all([
        client.readContract({ address: board, abi: bountyBoardAbi, functionName: "tierOf", args: [root] }),
        client.readContract({ address: board, abi: bountyBoardAbi, functionName: "stats", args: [root] }),
      ]);
      return { root, tier, accepted: stats[0], rejected: stats[1] };
    },
  };
}
