"use client";

import { IdentitySDK } from "@goodsdks/citizen-sdk";
import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CELO_CHAIN_ID } from "@eziokwu/shared";
import { WalletBar } from "@/components/WalletBar";
import { explain } from "@/lib/api";
import { config } from "@/lib/config";
import { openExternal } from "@/lib/telegram";
import { useMe } from "@/lib/useMe";
import { useMessageSigner } from "@/lib/useSigner";

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => (t = setTimeout(() => reject(new Error(message)), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export default function VerifyPage() {
  const { data: me, refetch } = useMe();
  const publicClient = usePublicClient();
  const { address: connected } = useAccount();
  const getSigner = useMessageSigner();
  const [checked, setChecked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>();
  const [error, setError] = useState<string>();

  async function startVerification() {
    setBusy(true);
    setError(undefined);
    try {
      if (me?.address && connected && connected.toLowerCase() !== me.address.toLowerCase())
        throw new Error(`This wallet (${connected.slice(0, 6)}…${connected.slice(-4)}) isn't the one you linked (${me.address.slice(0, 6)}…${me.address.slice(-4)}). Connect the linked wallet, or link this one.`);
      if (!publicClient) throw new Error("Couldn't reach the Celo network. Check your connection and try again.");
      const walletClient = await getSigner();
      setPhase("Preparing…");
      const sdk = await withTimeout(
        IdentitySDK.init({ publicClient: publicClient as never, walletClient: walletClient as never, env: config.sdkEnv }),
        20_000,
        "Couldn't reach the Celo network. Check your connection and try again.",
      );
      // After the selfie check, GoodDollar sends the user back here (deep link into the Mini App if configured).
      const callback = config.miniAppLink || window.location.href;
      // This asks the wallet to sign a message (it costs nothing); with WalletConnect it appears in the wallet app.
      setPhase("Open your wallet app and approve the signature request.");
      const link = await withTimeout(
        sdk.generateFVLink(false, callback, CELO_CHAIN_ID),
        120_000,
        "Your wallet didn't respond. Open your wallet app, approve the pending request (or reject it), then try again.",
      );
      setPhase(undefined);
      openExternal(link);
    } catch (e) {
      console.error("face verification start failed", e);
      setError(explain(e));
    } finally {
      setPhase(undefined);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Verify you're a real person</h1>
      <p className="hint">
        GoodDollar checks that you're a unique human with a quick face scan. This is what keeps {""}
        one person from taking many tasks. Your face image is not shared with us.
      </p>
      {me?.verified ? (
        <div className="card ok">✓ Verified</div>
      ) : (
        <>
          {!me?.linked && <p className="err">Link your wallet first.</p>}
          <WalletBar />
          <button disabled={busy || !me?.linked} onClick={startVerification}>
            {busy ? "Waiting…" : "Start face verification"}
          </button>
          {phase && <p className="hint">{phase}</p>}
          {busy && (
            <button className="secondary" style={{ marginTop: 10 }} onClick={() => { setBusy(false); setPhase(undefined); }}>
              Cancel
            </button>
          )}
          <button className="secondary" style={{ marginTop: 10 }} onClick={async () => {
            setChecked("Checking…");
            const r = await refetch();
            setChecked(r.data?.verified ? undefined : r.error ? "Couldn't reach the server. Try again." : `Not verified yet for ${r.data?.address?.slice(0, 6)}…${r.data?.address?.slice(-4)} on the ${config.sdkEnv} network.`);
          }}>
            I've finished, check again
          </button>
          {checked && <p className="hint">{checked}</p>}
          {config.sdkEnv === "production" && (
            <>
          <p className="hint" style={{ marginTop: 14 }}>
            Not working? You can verify in GoodDollar's own app instead, then come back and tap “check again”.
          </p>
          <button className="secondary" onClick={() => openExternal(config.gooddollarApp)}>
            Verify in GoodDollar's app
          </button>
            </>
          )}
        </>
      )}
      {error && <p className="err">{error}</p>}
    </>
  );
}
