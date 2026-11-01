"use client";

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
      <h1>Allow G$ for task deposits</h1>
      <p className="hint">
        One time only. Each task asks for a small refundable bond in G$ that you get back when your work is accepted. This lets the
        task contract take that bond when you tap Claim. It can't move anything else.
      </p>
      {me?.approved ? (
        <div className="card ok">✓ Done. You can take tasks.</div>
      ) : (
        <>
          <WalletBar />
          {wrongWallet && <p className="err">Connect the wallet you linked ({me?.address}).</p>}
          {me?.verified === false && <p className="err">Verify your face first.</p>}
          {me?.predeploy && <p className="err">The task contract isn't deployed yet, so there's nothing to approve. You're verified, so this step will work once it is.</p>}
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
