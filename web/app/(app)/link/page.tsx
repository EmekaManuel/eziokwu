"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { linkMessage } from "@eziokwu/shared";
import { WalletBar } from "@/components/WalletBar";
import { api, explain } from "@/lib/api";
import { getTelegramId } from "@/lib/telegram";
import { useMe } from "@/lib/useMe";
import { useMessageSigner } from "@/lib/useSigner";

export default function LinkPage() {
  const { address, isConnected } = useAccount();
  const getSigner = useMessageSigner();
  const { data: me, refetch } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function link() {
    setBusy(true);
    setError(undefined);
    try {
      const tg = getTelegramId();
      if (!tg) throw new Error("Open this page from the Telegram bot.");
      const { nonce } = await api<{ nonce: string }>("/v1/link/nonce");
      const signer = await getSigner();
      const signature = await signer.signMessage({ account: address!, message: linkMessage(tg, nonce) });
      await api("/v1/link", { body: { address, nonce, signature } });
      await refetch();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const alreadyLinked = !!me?.linked && !!address && me.address?.toLowerCase() === address.toLowerCase();

  return (
    <>
      <p className="step-tag">Step 1 of 3</p>
      <h1>Link your wallet</h1>
      <p className="hint">This is where your G$ earnings will be sent.</p>

      {alreadyLinked ? (
        <>
          <div className="card ok-card">
            <strong>✓ Wallet linked</strong>
            <div className="mono">{me?.address}</div>
          </div>
          <Link className="btn" href="/verify">Next: verify you're a real person</Link>
        </>
      ) : (
        <>
          <ol className="mini-steps" aria-label="Progress">
            <li className={isConnected ? "done" : "active"}><span>{isConnected ? "✓" : "1"}</span>Connect</li>
            <li className={isConnected ? "active" : ""}><span>2</span>Sign</li>
          </ol>

          {me?.linked && (
            <p className="hint">Currently linked: <span className="mono">{me.address}</span>. Linking this wallet replaces it.</p>
          )}

          <WalletBar />

          {isConnected && (
            <>
              <button disabled={busy} onClick={link}>
                {busy ? "Check your wallet app…" : me?.linked ? "Sign to link this wallet instead" : "Sign to link wallet"}
              </button>
              <p className="hint center-text">
                Signing is free and sends no money. It only proves this wallet is yours, and we can never move your funds.
              </p>
            </>
          )}
        </>
      )}
      {error && <p className="err">{error}</p>}
    </>
  );
}
