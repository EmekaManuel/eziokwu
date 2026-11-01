import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, defineChain, http, parseEther, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bountyBoardAbi, erc20Abi } from "@eziokwu/shared";
import { buildApp } from "../src/app";
import { Relayer, topupPolicyFrom } from "../src/relayer";
import { MemoryBlobStore, MemoryStore } from "../src/store";

export const BOT_TOKEN = "123456:TEST-bot-token-not-real";
const OUT = resolve(__dirname, "../../contracts/out");

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(`${OUT}/${file}/${name}.json`, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export const mockGdAbi = [
  ...erc20Abi,
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "a", type: "uint256" }], outputs: [] },
] as const;
export const mockIdentityAbi = [
  { type: "function", name: "setRoot", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "r", type: "address" }], outputs: [] },
] as const;

export async function startChain() {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
  const publicClient = createPublicClient({ chain, transport: http(url), pollingInterval: 50 });
  const testClient = createTestClient({ chain, mode: "anvil", transport: http(url) });

  /** Fresh funded account (key generated at runtime). */
  async function newAccount(eth = "10") {
    const account = privateKeyToAccount(generatePrivateKey());
    await testClient.setBalance({ address: account.address, value: parseEther(eth) });
    return { account, wallet: createWalletClient({ chain, account, transport: http(url) }) };
  }
  return { proc, url, chain, publicClient, testClient, newAccount, stop: () => proc.kill() };
}

export type Chain = Awaited<ReturnType<typeof startChain>>;

export async function deployAll(c: Chain, opts: { rateLimit?: boolean; topup?: Partial<{ enabled: boolean; amount: string; min: string; cap: string }> } = {}) {
  const deployer = await c.newAccount();
  const relayerAcct = await c.newAccount("5");
  const verifier = await c.newAccount();
  const requester = await c.newAccount();
  const feeRecipient = privateKeyToAccount(generatePrivateKey()).address;

  async function deploy(file: string, name: string, args: unknown[] = []) {
    const a = artifact(file, name);
    const hash = await deployer.wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args });
    const r = await c.publicClient.waitForTransactionReceipt({ hash });
    return r.contractAddress as Address;
  }
  const gd = await deploy("MockGD.sol", "MockGD");
  const identity = await deploy("MockIdentity.sol", "MockIdentity");
  const board = await deploy("BountyBoard.sol", "BountyBoard", [gd, identity, deployer.account.address, verifier.account.address, feeRecipient, 300]);

  const store = new MemoryStore();
  const blobs = new MemoryBlobStore();
  const relayer = new Relayer({
    publicClient: c.publicClient,
    walletClient: relayerAcct.wallet,
    board,
    gd,
    identity,
    store,
    topup: topupPolicyFrom({
      TOPUP_ENABLED: opts.topup?.enabled ?? false,
      TOPUP_AMOUNT_CELO: opts.topup?.amount ?? "0.01",
      TOPUP_MIN_BALANCE_CELO: opts.topup?.min ?? "0.005",
      TOPUP_DAILY_CAP_CELO: opts.topup?.cap ?? "1",
    }),
  });
  const app = await buildApp({
    config: { TELEGRAM_BOT_TOKEN: BOT_TOKEN, INITDATA_MAX_AGE_SECONDS: 3600, CORS_ORIGIN: "*", NGN_PER_GD: 0.15, TOPUP_ENABLED: opts.topup?.enabled ?? false },
    store,
    blobs,
    relayer,
    publicClient: c.publicClient,
    board,
    rateLimit: opts.rateLimit ?? false,
  });

  const write = async (w: { writeContract: (a: never) => Promise<Hex> }, a: object) => {
    const hash = await w.writeContract(a as never);
    return c.publicClient.waitForTransactionReceipt({ hash });
  };

  /** A worker with a wallet, optionally verified (Identity root = itself) and G$-funded + approved. */
  async function newWorker(o: { verified?: boolean; gd?: bigint; approve?: boolean; eth?: string } = {}) {
    const w = await c.newAccount(o.eth ?? "1");
    if (o.verified ?? true) await write(deployer.wallet, { address: identity, abi: mockIdentityAbi, functionName: "setRoot", args: [w.account.address, w.account.address] });
    if (o.gd) await write(deployer.wallet, { address: gd, abi: mockGdAbi, functionName: "mint", args: [w.account.address, o.gd] });
    if (o.approve) await write(w.wallet, { address: gd, abi: erc20Abi, functionName: "approve", args: [board, 2n ** 255n] });
    return w;
  }

  /** Requester funds + posts a bounty. Returns its id. */
  async function createBounty(p: { reward?: bigint; n?: number; bond?: bigint; minTier?: number; hours?: number } = {}) {
    const reward = p.reward ?? parseEther("100");
    const n = p.n ?? 1;
    await write(deployer.wallet, { address: gd, abi: mockGdAbi, functionName: "mint", args: [requester.account.address, reward * BigInt(n)] });
    await write(requester.wallet, { address: gd, abi: erc20Abi, functionName: "approve", args: [board, reward * BigInt(n)] });
    const latest = await c.publicClient.getBlock();
    const deadline = latest.timestamp + BigInt((p.hours ?? 24) * 3600);
    await write(requester.wallet, { address: board, abi: bountyBoardAbi, functionName: "createBounty", args: [reward, n, p.bond ?? parseEther("10"), p.minTier ?? 0, deadline, `0x${"11".repeat(32)}`] });
    return (await c.publicClient.readContract({ address: board, abi: bountyBoardAbi, functionName: "nextBountyId" })) - 1n;
  }

  return { ...c, deployer, relayerAcct, verifier, requester, feeRecipient, gd, identity, board, store, blobs, relayer, app, write, newWorker, createBounty };
}

export type Env = Awaited<ReturnType<typeof deployAll>>;
