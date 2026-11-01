"use client";

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

  return (
    <>
      <h1>Link your wallet</h1>
      <p className="hint">You sign a short message (it costs nothing) so we know this wallet is yours.</p>
      {me?.linked && address && me.address?.toLowerCase() === address.toLowerCase() ? (
        <div className="card ok">✓ Linked to {me.address}</div>
      ) : (
        <>
          {me?.linked && <p className="hint">Currently linked: {me.address}. Signing with the connected wallet replaces it.</p>}
          <WalletBar />
          <button disabled={!isConnected || busy} onClick={link}>
            {busy ? "Waiting for your wallet…" : me?.linked ? "Sign and link this wallet instead" : "Sign and link"}
          </button>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </>
  );
}
