"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import { celo } from "wagmi/chains";
import {
  bountyBoardAbi,
  claimTypedData,
  formatAmount,
  hashSubmission,
  submitTypedData,
  type SubmissionPayload,
} from "@eziokwu/shared";
import { api, explain } from "@/lib/api";
import { config } from "@/lib/config";
import { useMe } from "@/lib/useMe";

const CLAIM_STATES = ["none", "claimed", "submitted", "accepted", "rejected", "expired"] as const;

export default function TaskPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const bountyId = BigInt(/^\d+$/.test(idParam) ? idParam : "0");
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { data: me } = useMe();
  const worker = me?.address ?? address;

  const bounty = useReadContract({ address: config.board, abi: bountyBoardAbi, functionName: "bounties", args: [bountyId], query: { enabled: bountyId > 0n } });
  const claim = useReadContract({
    address: config.board,
    abi: bountyBoardAbi,
    functionName: "claims",
    args: [bountyId, worker!],
    query: { enabled: !!worker && bountyId > 0n, refetchInterval: 10_000 },
  });

  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const b = bounty.data;
  const state = CLAIM_STATES[claim.data?.[0] ?? 0];
  const ngn = me?.ngnPerGd;

  const readNonce = () => publicClient!.readContract({ address: config.board, abi: bountyBoardAbi, functionName: "nonces", args: [worker!] });
  const inFifteenMinutes = () => BigInt(Math.floor(Date.now() / 1000) + 900);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await claim.refetch();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const doClaim = () =>
    run(async () => {
      const deadline = inFifteenMinutes();
      const nonce = await readNonce();
      const signature = await signTypedDataAsync(claimTypedData({ chainId: celo.id, board: config.board, bountyId, worker: worker!, nonce, deadline }));
      await api("/v1/relay/claim", { body: { bountyId: bountyId.toString(), deadline: deadline.toString(), signature } });
    });

  const doSubmit = () =>
    run(async () => {
      const payload: SubmissionPayload = {
        v: 1,
        bountyId: bountyId.toString(),
        worker: worker!,
        answer: { price: Number(price), currency: "NGN", note: note.trim() },
        capturedAt: Math.floor(Date.now() / 1000),
      };
      // We compute the hash ourselves and refuse to sign anything the server hashed differently.
      const expected = hashSubmission(payload);
      const stored = await api<{ submissionHash: `0x${string}` }>("/v1/submissions", { body: { payload } });
      if (stored.submissionHash.toLowerCase() !== expected.toLowerCase()) throw new Error("The server stored a different answer than you wrote. Not submitting.");

      const deadline = inFifteenMinutes();
      const nonce = await readNonce();
      const signature = await signTypedDataAsync(submitTypedData({ chainId: celo.id, board: config.board, bountyId, worker: worker!, submissionHash: expected, nonce, deadline }));
      await api("/v1/relay/submit", { body: { bountyId: bountyId.toString(), submissionHash: expected, deadline: deadline.toString(), signature } });
    });

  if (bountyId === 0n) return <p className="err">Unknown task.</p>;
  if (bounty.isLoading) return <p className="hint">Loading…</p>;
  if (!b || b[0] === "0x0000000000000000000000000000000000000000") return <p className="err">Task not found.</p>;

  const [, , answersNeeded, minTier, accepted, active, refunded, deadline, reward, bond] = b;
  const fee = (reward * BigInt(b[1])) / 10000n;
  const open = answersNeeded - accepted - active - refunded;
  const closed = BigInt(Math.floor(Date.now() / 1000)) >= deadline;

  return (
    <>
      <h1>Task #{bountyId.toString()}</h1>
      <div className="card">
        <div className="row"><span>You earn</span><strong>{formatAmount(reward - fee, ngn)}</strong></div>
        <div className="row"><span className="hint">Refundable bond</span><span>{formatAmount(bond, ngn)}</span></div>
        <div className="row"><span className="hint">Min. tier</span><span>{minTier}</span></div>
        <div className="row"><span className="hint">Open slots</span><span>{closed ? 0 : open}</span></div>
        <div className="row"><span className="hint">Closes</span><span>{new Date(Number(deadline) * 1000).toLocaleString()}</span></div>
      </div>

      {(!me?.linked || !me?.verified || !me?.approved) && <p className="err">Finish setup on the home page first (link, verify, approve).</p>}

      {state === "none" && (
        <button disabled={busy || closed || open === 0 || !me?.approved || !me?.verified} onClick={doClaim}>
          {busy ? "Working…" : "Take this task"}
        </button>
      )}

      {state === "claimed" && (
        <div className="card">
          <p style={{ marginTop: 0 }}>You have this task. Submit your answer before your time runs out.</p>
          {/* TODO(stage 4): photo + live location capture. For now: price and a note. */}
          <label>Price you found (₦)</label>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          <label>Note (optional)</label>
          <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <button disabled={busy || !price} onClick={doSubmit}>
            {busy ? "Submitting…" : "Submit answer"}
          </button>
        </div>
      )}

      {state === "submitted" && <div className="card ok">✓ Submitted. You'll be paid once it's verified.</div>}
      {state === "accepted" && <div className="card ok">✓ Accepted. Payment sent.</div>}
      {state === "rejected" && <div className="card err">This answer was not accepted.</div>}
      {state === "expired" && <div className="card">Your time ran out and your bond was returned.</div>}
      {error && <p className="err">{error}</p>}
    </>
  );
}
