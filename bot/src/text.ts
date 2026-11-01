import { APP_NAME, formatAmount, formatDistance } from "@eziokwu/shared";
import type { FeedItem } from "./feed";

/** Telegram HTML mode: escape anything that did not come from us. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function timeLeft(deadline: bigint, nowSec = Math.floor(Date.now() / 1000)): string {
  const s = Number(deadline) - nowSec;
  if (s <= 0) return "closed";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min left`;
  if (s < 86_400) return `${Math.round(s / 3600)} h left`;
  return `${Math.round(s / 86_400)} d left`;
}

/** What the worker actually receives: reward minus the protocol fee. */
export const netReward = (reward: bigint, feeBps: number) => reward - (reward * BigInt(feeBps)) / 10_000n;

export const CLAIM_LABEL: Record<number, string> = {
  0: "Not taken",
  1: "In progress. Submit your answer",
  2: "Submitted. Waiting for review",
  3: "Accepted and paid",
  4: "Not accepted",
  5: "Expired",
};

export function taskLine(i: FeedItem, ngnPerGd: number): string {
  const { task: t, bounty: b } = i;
  const where = [t.marketName, t.city].filter(Boolean).join(", ");
  return [
    `<b>${esc(t.item ?? t.title)}</b> · ${formatDistance(i.task.distanceM)} away`,
    `${esc(formatAmount(netReward(b.reward, b.feeBps), ngnPerGd))} · ${timeLeft(b.deadline)}${where ? ` · ${esc(where)}` : ""}`,
  ].join("\n");
}

export const WELCOME = (linked: boolean) =>
  linked
    ? `<b>${APP_NAME}</b>: ground truth, paid in G$.\n\nYou're set up. Share your location to see tasks near you, or open one of the shortcuts below.`
    : `<b>${APP_NAME}</b>: ground truth, paid in G$.\n\nAnswer small real-world tasks near you and get paid in G$. Setup takes about a minute:\n\n1. Link your wallet\n2. Verify you're a real person (GoodDollar face check)\n3. Allow G$ for task deposits`;

export const NEED_SETUP = "Finish setup first, then I can show your tasks.";
export const ASK_LOCATION = "Share your location and I'll show tasks near you. I only use it to find tasks, and you can delete it any time with /forgetme.";
