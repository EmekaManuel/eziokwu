import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEther, type Address, type Hex } from "viem";
import { bountyBoardAbi, claimTypedData, erc20Abi, hashSubmission, hashTask, linkMessage, submitTypedData, EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION } from "@eziokwu/shared";
import { signInitData } from "../src/telegram";
import { BOT_TOKEN, deployAll, mockGdAbi, startChain, type Chain, type Env } from "./harness";

let chain: Chain;
let env: Env;
let topupEnv: Env;

beforeAll(async () => {
  chain = await startChain();
  env = await deployAll(chain);
  topupEnv = await deployAll(chain, { topup: { enabled: true, amount: "0.01", min: "0.005", cap: "0.025" } });
}, 60_000);
afterAll(() => chain?.stop());

let nextTg = 1000;
const tgHeader = (id: number) => ({ "x-telegram-init-data": signInitData({ id, username: `u${id}` }, BOT_TOKEN) });

type Worker = Awaited<ReturnType<Env["newWorker"]>>;

async function api(e: Env, method: "GET" | "POST", url: string, tg: number | null, body?: unknown) {
  const res = await e.app.inject({ method, url, headers: tg === null ? {} : tgHeader(tg), payload: body as never });
  return { status: res.statusCode, json: res.json() as Record<string, any> };
}

async function link(e: Env, w: Worker, tg: number) {
  const { json } = await api(e, "GET", "/v1/link/nonce", tg);
  const signature = await w.wallet.signMessage({ message: linkMessage(tg, json.nonce) });
  return api(e, "POST", "/v1/link", tg, { address: w.account.address, nonce: json.nonce, signature });
}

async function signClaim(e: Env, w: Worker, bountyId: bigint, signer: Worker = w, nonceOverride?: bigint) {
  const nonce = nonceOverride ?? (await e.publicClient.readContract({ address: e.board, abi: bountyBoardAbi, functionName: "nonces", args: [w.account.address] }));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
  const sig = await signer.wallet.signTypedData({
    account: signer.account,
    ...claimTypedData({ chainId: 31337, board: e.board, bountyId, worker: w.account.address, nonce, deadline }),
  });
  return { bountyId: bountyId.toString(), deadline: deadline.toString(), signature: sig };
}

const claimState = async (e: Env, id: bigint, who: Address) => (await e.publicClient.readContract({ address: e.board, abi: bountyBoardAbi, functionName: "claims", args: [id, who] }))[0];

describe("EIP-712 constants match the deployed contract", () => {
  it("domain name/version/chain/verifyingContract", async () => {
    const d = await env.publicClient.readContract({ address: env.board, abi: bountyBoardAbi, functionName: "eip712Domain" });
    expect(d[1]).toBe(EIP712_DOMAIN_NAME);
    expect(d[2]).toBe(EIP712_DOMAIN_VERSION);
    expect(Number(d[3])).toBe(31337);
    expect(d[4].toLowerCase()).toBe(env.board.toLowerCase());
  });
});

describe("auth", () => {
  it("rejects missing or forged initData", async () => {
    expect((await api(env, "GET", "/v1/me", null)).status).toBe(401);
    const forged = await env.app.inject({ method: "GET", url: "/v1/me", headers: { "x-telegram-init-data": signInitData({ id: 1 }, "1:wrong-token-xxxxx") } });
    expect(forged.statusCode).toBe(401);
  });
  it("health is open", async () => {
    expect((await env.app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});

describe("wallet linking", () => {
  it("links with a valid signature, then /me reflects chain state", async () => {
    const w = await env.newWorker({ verified: true });
    const tg = nextTg++;
    expect((await api(env, "GET", "/v1/me", tg)).json.linked).toBe(false);
    const r = await link(env, w, tg);
    expect(r.status).toBe(200);
    const me = (await api(env, "GET", "/v1/me", tg)).json;
    expect(me).toMatchObject({ linked: true, verified: true, approved: false, tier: 0 });
    expect(me.address.toLowerCase()).toBe(w.account.address.toLowerCase());
  });

  it("a nonce is single-use", async () => {
    const w = await env.newWorker();
    const tg = nextTg++;
    const { json } = await api(env, "GET", "/v1/link/nonce", tg);
    const signature = await w.wallet.signMessage({ message: linkMessage(tg, json.nonce) });
    const body = { address: w.account.address, nonce: json.nonce, signature };
    expect((await api(env, "POST", "/v1/link", tg, body)).status).toBe(200);
    expect((await api(env, "POST", "/v1/link", tg, body)).json.error).toBe("bad_nonce");
  });

  it("rejects a signature from a different wallet", async () => {
    const owner = await env.newWorker();
    const attacker = await env.newWorker();
    const tg = nextTg++;
    const { json } = await api(env, "GET", "/v1/link/nonce", tg);
    const signature = await attacker.wallet.signMessage({ message: linkMessage(tg, json.nonce) });
    const r = await api(env, "POST", "/v1/link", tg, { address: owner.account.address, nonce: json.nonce, signature });
    expect(r.json.error).toBe("bad_signature");
  });

  it("rejects a signature made for another Telegram id", async () => {
    const w = await env.newWorker();
    const tg = nextTg++;
    const { json } = await api(env, "GET", "/v1/link/nonce", tg);
    const signature = await w.wallet.signMessage({ message: linkMessage(tg + 1, json.nonce) });
    const r = await api(env, "POST", "/v1/link", tg, { address: w.account.address, nonce: json.nonce, signature });
    expect(r.json.error).toBe("bad_signature");
  });

  it("is one-to-one: a wallet cannot be linked to a second Telegram account", async () => {
    const w = await env.newWorker();
    expect((await link(env, w, nextTg++)).status).toBe(200);
    const r = await link(env, w, nextTg++);
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("link_conflict");
  });

  it("lets a Telegram account switch to another wallet it can sign for, freeing the old one", async () => {
    const a = await env.newWorker();
    const b = await env.newWorker();
    const tg = nextTg++;
    expect((await link(env, a, tg)).status).toBe(200);
    expect((await link(env, b, tg)).status).toBe(200);
    expect((await api(env, "GET", "/v1/me", tg)).json.address.toLowerCase()).toBe(b.account.address.toLowerCase());
    expect((await link(env, a, nextTg++)).status).toBe(200);
  });
});

describe("task descriptions", () => {
  it("serves the text behind a bounty, and 404s for an unknown one", async () => {
    const spec = { kind: "price" as const, title: "Rice", description: "50 kg bag", item: "Rice", unit: "bag", currency: "NGN", marketName: null, city: "Lagos", lat: 6.6, lng: 3.35, radiusM: 5000 };
    env.tasks.add({ bountyId: 77, specHash: hashTask(spec), spec });
    const ok = await api(env, "GET", "/v1/tasks/77", nextTg++);
    expect(ok.status).toBe(200);
    expect(ok.json.spec.title).toBe("Rice");
    expect(ok.json.specHash).toBe(hashTask(spec));
    expect((await api(env, "GET", "/v1/tasks/78", nextTg++)).status).toBe(404);
    expect((await api(env, "GET", "/v1/tasks/abc", nextTg++)).status).toBe(400);
    expect((await api(env, "GET", "/v1/tasks/77", null)).status).toBe(401); // initData required
  });
});

describe("gasless claim -> submit -> resolve (end to end)", () => {
  it("pays the worker, with the relayer paying all gas", async () => {
    const w = await env.newWorker({ verified: true, gd: parseEther("50"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty({ reward: parseEther("100"), bond: parseEther("10") });
    const workerCeloBefore = await env.publicClient.getBalance({ address: w.account.address });
    const relayerCeloBefore = await env.publicClient.getBalance({ address: env.relayerAcct.account.address });

    // claim
    const c = await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id));
    expect(c.status, JSON.stringify(c.json)).toBe(200);
    expect(await claimState(env, id, w.account.address)).toBe(1);

    // upload answer, check the hash is what the client would compute itself
    const payload = { v: 1 as const, bountyId: id.toString(), worker: w.account.address, answer: { item: "rice", price: 1200, note: "50kg bag" }, capturedAt: Math.floor(Date.now() / 1000) };
    const up = await api(env, "POST", "/v1/submissions", tg, { payload });
    expect(up.status, JSON.stringify(up.json)).toBe(200);
    expect(up.json.submissionHash).toBe(hashSubmission(payload));
    expect(await env.blobs.has(up.json.submissionHash)).toBe(true);

    // submit (nonce is now 1)
    const nonce = await env.publicClient.readContract({ address: env.board, abi: bountyBoardAbi, functionName: "nonces", args: [w.account.address] });
    expect(nonce).toBe(1n);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
    const sig = await w.wallet.signTypedData({ account: w.account, ...submitTypedData({ chainId: 31337, board: env.board, bountyId: id, worker: w.account.address, submissionHash: up.json.submissionHash, nonce, deadline }) });
    const s = await api(env, "POST", "/v1/relay/submit", tg, { bountyId: id.toString(), submissionHash: up.json.submissionHash, deadline: deadline.toString(), signature: sig });
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    expect(await claimState(env, id, w.account.address)).toBe(2);
    // our own record follows the relayed steps (used by /mytasks)
    expect(env.tasks.claims.get(`${id}:${w.account.address.toLowerCase()}`)).toEqual({ telegramId: String(tg), state: "submitted" });
    const stored = await env.publicClient.readContract({ address: env.board, abi: bountyBoardAbi, functionName: "claims", args: [id, w.account.address] });
    expect(stored[4]).toBe(up.json.submissionHash);

    // verifier resolves -> worker gets reward - 3% fee + bond back
    await env.write(env.verifier.wallet, { address: env.board, abi: bountyBoardAbi, functionName: "resolve", args: [id, w.account.address, true] });
    const bal = await env.publicClient.readContract({ address: env.gd, abi: erc20Abi, functionName: "balanceOf", args: [w.account.address] });
    expect(bal).toBe(parseEther("50") + parseEther("97"));
    expect(await env.publicClient.readContract({ address: env.gd, abi: erc20Abi, functionName: "balanceOf", args: [env.feeRecipient] })).toBe(parseEther("3"));

    // worker spent no CELO; relayer did
    expect(await env.publicClient.getBalance({ address: w.account.address })).toBe(workerCeloBefore);
    expect(await env.publicClient.getBalance({ address: env.relayerAcct.account.address })).toBeLessThan(relayerCeloBefore);
  });
});

describe("the relayer cannot act without a valid worker signature", () => {
  it("rejects a signature by someone else", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const other = await env.newWorker();
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    const r = await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id, other));
    expect(r.json.error).toBe("InvalidSignature");
    expect(await claimState(env, id, w.account.address)).toBe(0);
  });

  it("rejects a signature for a different bounty", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const a = await env.createBounty();
    const b = await env.createBounty();
    const signedForA = await signClaim(env, w, a);
    const r = await api(env, "POST", "/v1/relay/claim", tg, { ...signedForA, bountyId: b.toString() });
    expect(r.json.error).toBe("InvalidSignature");
  });

  it("rejects an expired signature", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    const nonce = 0n;
    const deadline = 1n; // long past
    const signature = await w.wallet.signTypedData({ account: w.account, ...claimTypedData({ chainId: 31337, board: env.board, bountyId: id, worker: w.account.address, nonce, deadline }) });
    const r = await api(env, "POST", "/v1/relay/claim", tg, { bountyId: id.toString(), deadline: "1", signature });
    expect(r.json.error).toBe("SignatureExpired");
  });

  it("a replayed signature fails once it has been used", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty({ n: 2 });
    const body = await signClaim(env, w, id);
    expect((await api(env, "POST", "/v1/relay/claim", tg, body)).status).toBe(200);
    const again = await api(env, "POST", "/v1/relay/claim", tg, body);
    expect(again.status).toBe(400);
    expect(again.json.error).toBe("InvalidSignature");
  });

  it("an unlinked Telegram user cannot use the relay at all", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const id = await env.createBounty();
    const r = await api(env, "POST", "/v1/relay/claim", nextTg++, await signClaim(env, w, id));
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("not_linked");
  });

  it("a linked user cannot relay a claim that names another worker's signature", async () => {
    // attacker is linked; victim's signature is for the victim's address, but the relay always uses the
    // caller's linked address, so the contract sees (attacker, victim-sig) and rejects.
    const victim = await env.newWorker({ gd: parseEther("20"), approve: true });
    const attacker = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, attacker, tg);
    const id = await env.createBounty({ n: 2 });
    const victimSigned = await signClaim(env, victim, id);
    const r = await api(env, "POST", "/v1/relay/claim", tg, victimSigned);
    expect(r.json.error).toBe("InvalidSignature");
    expect(await claimState(env, id, victim.account.address)).toBe(0);
  });

  it("submit refuses a hash we never stored", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id));
    const hash = `0x${"ab".repeat(32)}` as Hex;
    const r = await api(env, "POST", "/v1/relay/submit", tg, { bountyId: id.toString(), submissionHash: hash, deadline: "99999999999", signature: `0x${"00".repeat(65)}` });
    expect(r.json.error).toBe("unknown_submission");
  });

  it("submissions are only stored for claimed slots, and only for your own wallet", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    const mk = (worker: Address) => ({ payload: { v: 1, bountyId: id.toString(), worker, answer: { price: 1 }, capturedAt: 1700000000 } });
    expect((await api(env, "POST", "/v1/submissions", tg, mk(w.account.address))).json.error).toBe("not_claimed");
    const stranger = await env.newWorker();
    expect((await api(env, "POST", "/v1/submissions", tg, mk(stranger.account.address))).json.error).toBe("wrong_worker");
  });
});

describe("claim error mapping", () => {
  it("not verified -> NotVerified", async () => {
    const w = await env.newWorker({ verified: false, gd: parseEther("20"), approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    expect((await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id))).json.error).toBe("NotVerified");
  });
  it("no approval -> needs_approval", async () => {
    const w = await env.newWorker({ gd: parseEther("20"), approve: false });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    expect((await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id))).json.error).toBe("needs_approval");
  });
  it("no G$ for the bond -> insufficient_balance", async () => {
    const w = await env.newWorker({ gd: 0n, approve: true });
    const tg = nextTg++;
    await link(env, w, tg);
    const id = await env.createBounty();
    expect((await api(env, "POST", "/v1/relay/claim", tg, await signClaim(env, w, id))).json.error).toBe("insufficient_balance");
  });
  it("malformed bodies are 400", async () => {
    const w = await env.newWorker();
    const tg = nextTg++;
    await link(env, w, tg);
    const r = await api(env, "POST", "/v1/relay/claim", tg, { bountyId: "x", deadline: "1", signature: "0x12" });
    expect(r.status).toBe(400);
  });
});

describe("CELO top-up for the approval (capped feature flag)", () => {
  it("is refused when the flag is off", async () => {
    const w = await env.newWorker({ eth: "0" });
    const tg = nextTg++;
    await link(env, w, tg);
    const r = await api(env, "POST", "/v1/topup", tg);
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("topup_disabled");
  });

  it("funds a verified worker with no gas, once only", async () => {
    const w = await topupEnv.newWorker({ eth: "0" });
    await topupEnv.testClient.setBalance({ address: w.account.address, value: 0n });
    const tg = nextTg++;
    await link(topupEnv, w, tg);
    const r = await api(topupEnv, "POST", "/v1/topup", tg);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(await topupEnv.publicClient.getBalance({ address: w.account.address })).toBe(parseEther("0.01"));
    // the funded wallet can now afford the approval itself
    await topupEnv.write(w.wallet, { address: topupEnv.gd, abi: erc20Abi, functionName: "approve", args: [topupEnv.board, 1n] });
    // second request: balance is now enough anyway; and even when drained, the one-shot is spent
    await topupEnv.testClient.setBalance({ address: w.account.address, value: 0n });
    const again = await api(topupEnv, "POST", "/v1/topup", tg);
    expect(again.status).toBe(429);
    expect(again.json.error).toBe("topup_limit");
  });

  it("refuses unverified humans", async () => {
    const w = await topupEnv.newWorker({ verified: false, eth: "0" });
    await topupEnv.testClient.setBalance({ address: w.account.address, value: 0n });
    const tg = nextTg++;
    await link(topupEnv, w, tg);
    expect((await api(topupEnv, "POST", "/v1/topup", tg)).json.error).toBe("not_verified");
  });

  it("refuses workers who already have enough CELO", async () => {
    const w = await topupEnv.newWorker({ eth: "1" });
    const tg = nextTg++;
    await link(topupEnv, w, tg);
    expect((await api(topupEnv, "POST", "/v1/topup", tg)).json.error).toBe("topup_not_needed");
  });

  it("stops at the global daily cap (cap 0.025 = two top-ups of 0.01)", async () => {
    // one top-up was already spent in this env by the earlier test, so only one more fits.
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      const w = await topupEnv.newWorker({ eth: "0" });
      await topupEnv.testClient.setBalance({ address: w.account.address, value: 0n });
      const tg = nextTg++;
      await link(topupEnv, w, tg);
      const r = await api(topupEnv, "POST", "/v1/topup", tg);
      results.push(r.status === 200 ? "ok" : r.json.error);
    }
    expect(results.filter((x) => x === "ok").length).toBe(1);
    expect(results.filter((x) => x === "topup_limit").length).toBe(2);
  });

  it("a failed send releases the reservation", async () => {
    // relayer cannot afford the transfer -> reservation must be returned so the worker can retry later
    const e = await deployAll(chain, { topup: { enabled: true, amount: "0.01", min: "0.005", cap: "1" } });
    await e.testClient.setBalance({ address: e.relayerAcct.account.address, value: 0n });
    const w = await e.newWorker({ eth: "0" });
    await e.testClient.setBalance({ address: w.account.address, value: 0n });
    const tg = nextTg++;
    await link(e, w, tg);
    expect((await api(e, "POST", "/v1/topup", tg)).status).toBeGreaterThanOrEqual(500);
    await e.testClient.setBalance({ address: e.relayerAcct.account.address, value: parseEther("1") });
    expect((await api(e, "POST", "/v1/topup", tg)).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("throttles the relay endpoints per IP", async () => {
    const e = await deployAll(chain, { rateLimit: true });
    const w = await e.newWorker();
    const tg = nextTg++;
    await link(e, w, tg);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await api(e, "POST", "/v1/relay/claim", tg, { bountyId: "1", deadline: "1", signature: `0x${"00".repeat(65)}` })).status);
    expect(statuses).toContain(429);
  });
});
