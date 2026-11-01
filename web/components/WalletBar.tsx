"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function shorten(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

/** Connect / show the wallet. Mobile wallets connect through WalletConnect inside Telegram. */
export function WalletBar() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  // Telegram's in-app browser has no wallet extension; only offer "Browser wallet" where one exists.
  // Checked after mount because window is not available during server rendering.
  const [hasInjected, setHasInjected] = useState(false);
  useEffect(() => setHasInjected(typeof (window as { ethereum?: unknown }).ethereum !== "undefined"), []);
  const options = connectors.filter((c) => c.type !== "injected" || hasInjected);

  if (isConnected)
    return (
      <div className="card row">
        <span>Wallet {shorten(address)}</span>
        <button className="secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );

  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Connect the wallet where you receive G$.</p>
      {options.length === 0 && (
        <p className="err">
          Wallet connection isn't set up yet. (Developer: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and restart the web app.)
        </p>
      )}
      {options.map((c) => (
        <button key={c.uid} disabled={isPending} style={{ marginBottom: 8 }} onClick={() => connect({ connector: c })}>
          {c.type === "injected" ? "Browser wallet" : c.name}
        </button>
      ))}
      {error && <p className="err">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
