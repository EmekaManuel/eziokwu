"use client";

import Link from "next/link";
import { useState } from "react";
import { maxUint256, parseEther } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi } from "@eziokwu/shared";
import { WalletBar } from "@/components/WalletBar";
import { api, explain } from "@/lib/api";
import { config } from "@/lib/config";
import { useMe } from "@/lib/useMe";

export default function ApprovePage() {
  const { data: me, refetch } = useMe();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<"topup" | "approve">();
  const [error, setError] = useState<string>();

  const lowGas = me?.celoBalance !== undefined && BigInt(me.celoBalance) < parseEther("0.005");
  const wrongWallet = !!me?.address && !!address && me.address.toLowerCase() !== address.toLowerCase();

  async function topup() {
    setBusy("topup");
    setError(undefined);
    try {
      await api("/v1/topup", { method: "POST", body: {} });
      await refetch();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function approve() {
    setBusy("approve");
    setError(undefined);
    try {
      const hash = await writeContractAsync({ address: config.gd, abi: erc20Abi, functionName: "approve", args: [config.board, maxUint256] });
      await publicClient?.waitForTransactionReceipt({ hash });
      await refetch();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <p className="step-tag">Step 3 of 3</p>
      <h1>Allow G$ for task deposits</h1>
      <p className="hint">One quick approval so you can take tasks.</p>
      <ul className="facts">
        <li><strong>Bond only.</strong> Each task holds a small amount of G$ while you work.</li>
        <li><strong>Refundable.</strong> You get it back when your work is accepted.</li>
        <li><strong>One time.</strong> You won't be asked again.</li>
      </ul>
      {me?.approved ? (
        <>
          <div className="card ok-card"><strong>✓ All set</strong><div className="hint">You can take tasks now.</div></div>
          <Link className="btn" href="/app">Back to home</Link>
        </>
      ) : (
        <>
          <WalletBar />
          {wrongWallet && <p className="err">Connect the wallet you linked: <span className="mono">{me?.address}</span></p>}
          {me?.verified === false && <p className="err">Verify your face first.</p>}
          {me?.predeploy && (
            <div className="card info-card">
              <strong>Almost ready</strong>
              <div className="hint">The task contract isn't live yet, so there's nothing to approve for now. You're already verified, and this step unlocks as soon as it launches.</div>
            </div>
          )}
          {lowGas && (
            <div className="card">
              <p style={{ marginTop: 0 }}>You need a tiny amount of CELO to pay the network fee for this one step.</p>
              {me?.topupAvailable ? (
                <button disabled={busy !== undefined || !me?.verified} onClick={topup}>
                  {busy === "topup" ? "Sending…" : "Get free gas (one time)"}
                </button>
              ) : (
                <p className="hint">Free gas is not available right now. Send a little CELO to your wallet.</p>
              )}
            </div>
          )}
          <button disabled={busy !== undefined || !me?.verified || me?.predeploy || wrongWallet || lowGas} onClick={approve}>
            {busy === "approve" ? "Confirm in your wallet…" : "Approve G$"}
          </button>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </>
  );
}
