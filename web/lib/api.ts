import { config } from "./config";
import { getInitData } from "./telegram";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", "x-telegram-init-data": getInitData() },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    // Browsers report every connection failure as a bare TypeError ("Load failed" on iOS/Safari).
    const localhostFromHttps = /^http:\/\/(localhost|127\.)/.test(config.apiUrl) && typeof window !== "undefined" && window.location.protocol === "https:";
    throw new ApiError(
      "network",
      localhostFromHttps
        ? `Can't reach the server: NEXT_PUBLIC_API_URL is ${config.apiUrl}, which only exists on the developer's computer. Point it at a public HTTPS URL.`
        : "Can't reach the server. Check your connection and try again.",
      0,
    );
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(json.error ?? "error", json.message ?? `request failed (${res.status})`, res.status);
  return json as T;
}

export interface Me {
  linked: boolean;
  address?: `0x${string}`;
  root?: `0x${string}`;
  verified?: boolean;
  /** True until the BountyBoard contract is deployed. */
  predeploy?: boolean;
  approved?: boolean;
  allowance?: string;
  celoBalance?: string;
  nonce?: string;
  tier?: number;
  topupAvailable?: boolean;
  ngnPerGd?: number;
}

/** Friendly text for API/contract error codes. */
export function explain(e: unknown): string {
  if (e instanceof ApiError) {
    const m: Record<string, string> = {
      needs_approval: "Approve G$ first (one-time step).",
      insufficient_balance: "You need a little G$ in your wallet to post the refundable bond.",
      NotVerified: "Your face verification isn't active. Verify again.",
      TierTooLow: "This task needs a higher trust tier.",
      NoOpenSlot: "All slots on this task are taken.",
      BountyClosed: "This task has closed.",
      AlreadyClaimed: "You already took this task.",
      RootAlreadyClaimed: "You (or a linked wallet of yours) already took this task.",
      SelfClaim: "You can't take your own task.",
      SignatureExpired: "That took too long. Try again.",
      ClaimExpiredAlready: "Your time for this task ran out.",
      topup_limit: "The free gas top-up was already used or is paused.",
      topup_not_needed: "You already have enough CELO for gas.",
      not_linked: "Link your wallet first.",
      unauthorized: "Open this page from the Telegram bot.",
    };
    return m[e.code] ?? e.message;
  }
  return e instanceof Error ? e.message.split("\n")[0]! : "Something went wrong";
}
