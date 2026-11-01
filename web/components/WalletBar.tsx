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
      <div className="card wallet-chip">
        <span className="live-dot" aria-hidden="true" />
        <div className="wallet-info">
          <strong>Wallet connected</strong>
          <span className="mono">{shorten(address)}</span>
        </div>
        <button className="secondary" onClick={() => disconnect()}>Disconnect</button>
      </div>
    );

  return (
    <div className="card connect-card">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" />
        <path d="M3 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3" />
        <path d="M21 9.5h-4.5a2.25 2.25 0 0 0 0 4.5H21z" />
      </svg>
      <strong>Connect your wallet</strong>
      <p className="hint">Works with MetaMask, Valora, Trust Wallet and most other wallet apps.</p>
      {options.length === 0 && (
        <p className="err">
          Wallet connection isn't set up yet. (Developer: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and restart the web app.)
        </p>
      )}
      {options.map((c) => (
        <button key={c.uid} disabled={isPending} onClick={() => connect({ connector: c })}>
          {isPending ? "Opening…" : c.type === "injected" ? "Use browser wallet" : "Connect wallet"}
        </button>
      ))}
      {error && <p className="err">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
