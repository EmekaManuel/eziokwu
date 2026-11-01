import {
  BaseError,
  ContractFunctionRevertedError,
  parseEther,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { bountyBoardAbi, erc20Abi, identityAbi, tokenErrorsAbi } from "@eziokwu/shared";
import type { Store } from "./store";

const abi = [...bountyBoardAbi, ...tokenErrorsAbi] as const;

export class RelayError extends Error {
  constructor(
    public code: string,
    message?: string,
    public status = 400,
  ) {
    super(message ?? code);
  }
}

export interface TopupPolicy {
  enabled: boolean;
  amountWei: bigint;
  minBalanceWei: bigint;
  dailyCapWei: bigint;
}

export function topupPolicyFrom(c: { TOPUP_ENABLED: boolean; TOPUP_AMOUNT_CELO: string; TOPUP_MIN_BALANCE_CELO: string; TOPUP_DAILY_CAP_CELO: string }): TopupPolicy {
  return {
    enabled: c.TOPUP_ENABLED,
    amountWei: parseEther(c.TOPUP_AMOUNT_CELO),
    minBalanceWei: parseEther(c.TOPUP_MIN_BALANCE_CELO),
    dailyCapWei: parseEther(c.TOPUP_DAILY_CAP_CELO),
  };
}

interface Deps {
  publicClient: PublicClient<Transport, Chain>;
  walletClient: WalletClient<Transport, Chain, Account>;
  board: Address;
  gd: Address;
  identity: Address;
  store: Store;
  topup: TopupPolicy;
}

/**
 * Pays gas for gasless worker actions. It only ever calls claimFor / submitFor with a signature the
 * WORKER produced; the contract verifies that signature (EIP-712, nonce, deadline), so a compromised
 * relayer key can at worst waste its own gas. Every call is simulated first, so reverting
 * transactions are never sent.
 */
export class Relayer {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private d: Deps) {}

  get address(): Address {
    return this.d.walletClient.account.address;
  }

  /** Serialises sends so the relayer's own nonce never races. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async claimFor(bountyId: bigint, worker: Address, deadline: bigint, signature: Hex): Promise<Hex> {
    return this.send("claimFor", [bountyId, worker, deadline, signature]);
  }

  async submitFor(bountyId: bigint, worker: Address, submissionHash: Hex, deadline: bigint, signature: Hex): Promise<Hex> {
    return this.send("submitFor", [bountyId, worker, submissionHash, deadline, signature]);
  }

  private async send(functionName: "claimFor" | "submitFor", args: readonly unknown[]): Promise<Hex> {
    const account = this.d.walletClient.account;
    let request;
    try {
      ({ request } = await this.d.publicClient.simulateContract({
        account,
        address: this.d.board,
        abi,
        functionName,
        args: args as never,
      }));
    } catch (e) {
      throw this.decode(e);
    }
    return this.enqueue(async () => {
      const hash = await this.d.walletClient.writeContract(request as never);
      const receipt = await this.d.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new RelayError("tx_reverted", "transaction reverted", 502);
      return hash;
    });
  }

  private decode(e: unknown): RelayError {
    if (e instanceof BaseError) {
      const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
      if (revert instanceof ContractFunctionRevertedError) {
        const name = revert.data?.errorName ?? "reverted";
        // Worker-side token problems are surfaced distinctly so the Mini App can send them to /approve.
        if (name === "ERC20InsufficientAllowance") return new RelayError("needs_approval", "approve G$ first");
        if (name === "ERC20InsufficientBalance") return new RelayError("insufficient_balance", "not enough G$ for the bond");
        return new RelayError(name, revert.reason ?? name);
      }
    }
    return new RelayError("simulation_failed", e instanceof Error ? e.message : "simulation failed", 502);
  }

  /**
   * Sends a tiny CELO top-up so a freshly verified worker can pay gas for the one-time G$ approval.
   * Guards: feature flag, verified human only, once per address, only if the balance is below the
   * threshold, and a rolling 24h global cap. All limits are enforced before any funds move.
   */
  async topupForApproval(worker: Address): Promise<{ hash: Hex; amountWei: bigint }> {
    const p = this.d.topup;
    if (!p.enabled) throw new RelayError("topup_disabled", "gas top-ups are switched off", 403);

    const root = await this.d.publicClient.readContract({ address: this.d.identity, abi: identityAbi, functionName: "getWhitelistedRoot", args: [worker] });
    if (/^0x0{40}$/.test(root)) throw new RelayError("not_verified", "verify your face first", 403);

    const balance = await this.d.publicClient.getBalance({ address: worker });
    if (balance >= p.minBalanceWei) throw new RelayError("topup_not_needed", "you already have enough CELO for gas");

    const reserved = await this.d.store.reserveTopup(worker, p.amountWei, p.dailyCapWei, Date.now());
    if (!reserved) throw new RelayError("topup_limit", "top-up already used or daily budget reached", 429);

    try {
      return await this.enqueue(async () => {
        const hash = await this.d.walletClient.sendTransaction({ to: worker, value: p.amountWei });
        const receipt = await this.d.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new RelayError("tx_reverted", "top-up failed", 502);
        return { hash, amountWei: p.amountWei };
      });
    } catch (e) {
      await this.d.store.releaseTopup(worker);
      throw e;
    }
  }

  /** Identity-only check; works before the BountyBoard is deployed. */
  async identityRoot(worker: Address) {
    const root = await this.d.publicClient.readContract({ address: this.d.identity, abi: identityAbi, functionName: "getWhitelistedRoot", args: [worker] });
    return { root, verified: !/^0x0{40}$/.test(root) };
  }

  /** Read helpers for /me. */
  async workerState(worker: Address) {
    const { publicClient, board, gd, identity } = this.d;
    const [root, allowance, celo, nonce] = await Promise.all([
      publicClient.readContract({ address: identity, abi: identityAbi, functionName: "getWhitelistedRoot", args: [worker] }),
      publicClient.readContract({ address: gd, abi: erc20Abi, functionName: "allowance", args: [worker, board] }),
      publicClient.getBalance({ address: worker }),
      publicClient.readContract({ address: board, abi: bountyBoardAbi, functionName: "nonces", args: [worker] }),
    ]);
    const verified = !/^0x0{40}$/.test(root);
    const tier = verified ? await publicClient.readContract({ address: board, abi: bountyBoardAbi, functionName: "tierOf", args: [root] }) : 0;
    return { root, verified, allowance, celo, nonce, tier };
  }
}
