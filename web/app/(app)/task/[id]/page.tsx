"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { celo } from "wagmi/chains";
import {
  bountyBoardAbi,
  claimTypedData,
  formatAmount,
  hashSubmission,
  hashTask,
  submitTypedData,
  type SubmissionPayload,
  type TaskSpec,
} from "@eziokwu/shared";
import { WalletBar } from "@/components/WalletBar";
import { api, explain } from "@/lib/api";
import { config } from "@/lib/config";
import { useMe } from "@/lib/useMe";
import { useMessageSigner } from "@/lib/useSigner";

const CLAIM_STATES = ["none", "claimed", "submitted", "accepted", "rejected", "expired"] as const;

export default function TaskPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const bountyId = BigInt(/^\d+$/.test(idParam) ? idParam : "0");
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const getSigner = useMessageSigner();
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

  // The text behind the on-chain specHash. We recompute the hash ourselves, so a tampered description is detected.
  const spec = useQuery({ queryKey: ["task", idParam], enabled: bountyId > 0n, retry: false, queryFn: () => api<{ spec: TaskSpec; specHash: `0x${string}` }>(`/v1/tasks/${bountyId}`) });

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
      const signature = await (await getSigner()).signTypedData({ account: worker!, ...claimTypedData({ chainId: celo.id, board: config.board, bountyId, worker: worker!, nonce, deadline }) });
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
      const signature = await (await getSigner()).signTypedData({ account: worker!, ...submitTypedData({ chainId: celo.id, board: config.board, bountyId, worker: worker!, submissionHash: expected, nonce, deadline }) });
      await api("/v1/relay/submit", { body: { bountyId: bountyId.toString(), submissionHash: expected, deadline: deadline.toString(), signature } });
    });

  if (bountyId === 0n) return <div className="card err-card"><strong>Unknown task</strong><div className="hint">Check the task number and try again.</div></div>;
  if (bounty.isLoading) return <div className="card skeleton" aria-busy="true">Loading task…</div>;
  if (!b || b[0] === "0x0000000000000000000000000000000000000000") return <div className="card err-card"><strong>Task not found</strong><div className="hint">It may have been removed, or the number is wrong.</div></div>;

  const [, , answersNeeded, minTier, accepted, active, refunded, deadline, reward, bond, onChainSpecHash] = b;
  const task = spec.data?.spec;
  const specOk = !!task && hashTask(task).toLowerCase() === onChainSpecHash.toLowerCase();
  const fee = (reward * BigInt(b[1])) / 10000n;
  const open = answersNeeded - accepted - active - refunded;
  const closed = BigInt(Math.floor(Date.now() / 1000)) >= deadline;

  return (
    <>
      <p className="step-tag">Task #{bountyId.toString()}</p>
      <h1>{specOk ? task!.title : "Price check"}</h1>
      {specOk && (
        <div className="card spec">
          <p style={{ margin: 0 }}>{task!.description}</p>
          <div className="chips">
            {task!.item && <span className="chip">{task!.item}</span>}
            {task!.marketName && <span className="chip">{task!.marketName}</span>}
            {task!.city && <span className="chip">{task!.city}</span>}
            <span className="chip">within {task!.radiusM >= 1000 ? `${task!.radiusM / 1000} km` : `${task!.radiusM} m`}</span>
          </div>
          <div className="hint spec-ok">✓ This description matches the one locked on-chain.</div>
        </div>
      )}
      {task && !specOk && (
        <div className="card err-card"><strong>Description doesn't match</strong><div className="hint">The text we have for this task doesn't match what the requester locked on-chain. Don't take it.</div></div>
      )}
      {!task && !spec.isLoading && <p className="hint">No description is available for this task yet.</p>}
      <div className="card">
        <div className="row"><span>You earn</span><strong>{formatAmount(reward - fee, ngn)}</strong></div>
        <div className="row"><span className="hint">Refundable bond</span><span>{formatAmount(bond, ngn)}</span></div>
        <div className="row"><span className="hint">Min. tier</span><span>{minTier}</span></div>
        <div className="row"><span className="hint">Open slots</span><span>{closed ? 0 : open}</span></div>
        <div className="row"><span className="hint">Closes</span><span>{new Date(Number(deadline) * 1000).toLocaleString()}</span></div>
      </div>

      {!isConnected && (
        <>
          <p className="hint">Reconnect your wallet to sign. Signing is free and sends no money.</p>
          <WalletBar />
        </>
      )}
      {isConnected && !!me?.address && address?.toLowerCase() !== me.address.toLowerCase() && (
        <p className="err">Connect the wallet you linked: <span className="mono">{me.address}</span></p>
      )}

      {(!me?.linked || !me?.verified || !me?.approved) && <p className="err">Finish setup on the home page first (link, verify, approve).</p>}

      {state === "none" && (
        <button disabled={busy || !isConnected || closed || open === 0 || !me?.approved || !me?.verified} onClick={doClaim}>
          {busy ? "Working…" : "Take this task"}
        </button>
      )}

      {state === "claimed" && (
        <div className="card">
          <p style={{ marginTop: 0 }}>You have this task. Submit your answer before your time runs out.</p>
          {/* TODO(stage 4): photo + live location capture. For now: price and a note. */}
          <label>{task?.item ? `Price of ${task.item}${task.unit ? ` (per ${task.unit})` : ""} (₦)` : "Price you found (₦)"}</label>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          <label>Note (optional)</label>
          <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <button disabled={busy || !isConnected || !price} onClick={doSubmit}>
            {busy ? "Submitting…" : "Submit answer"}
          </button>
        </div>
      )}

      {state === "submitted" && <div className="card ok-card"><strong>✓ Submitted</strong><div className="hint">You'll be paid once it's verified.</div></div>}
      {state === "accepted" && <div className="card ok-card"><strong>✓ Accepted</strong><div className="hint">Payment sent to your wallet.</div></div>}
      {state === "rejected" && <div className="card err-card"><strong>Not accepted</strong><div className="hint">This answer was not accepted.</div></div>}
      {state === "expired" && <div className="card">Your time ran out and your bond was returned.</div>}
      {error && <p className="err">{error}</p>}
    </>
  );
}
