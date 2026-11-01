import { formatUnits } from "viem";
import { DEFAULT_NGN_PER_GD, TOKEN_SYMBOL } from "./config";

/** "1,250 G$" from an 18-decimal amount (max 2 decimals, trailing zeros trimmed). */
export function formatGD(amountWei: bigint): string {
  const n = Number(formatUnits(amountWei, 18));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${TOKEN_SYMBOL}`;
}

/** "≈ ₦187.5" for an 18-decimal G$ amount at `ngnPerGd`. */
export function formatNGN(amountWei: bigint, ngnPerGd: number = DEFAULT_NGN_PER_GD): string {
  const n = Number(formatUnits(amountWei, 18)) * ngnPerGd;
  return `≈ ₦${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 })}`;
}

/** "1,250 G$ (≈ ₦187)": the standard way to show any amount. */
export function formatAmount(amountWei: bigint, ngnPerGd: number = DEFAULT_NGN_PER_GD): string {
  return `${formatGD(amountWei)} (${formatNGN(amountWei, ngnPerGd)})`;
}
