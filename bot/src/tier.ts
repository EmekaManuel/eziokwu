import type { WorkerInfo } from "./chain";

/** Mirrors BountyBoard.tierOf: [minimum accepted, max rejected as 1/N of accepted]. */
const TIERS = [
  { tier: 3, accepted: 100, rejectDivisor: 20 },
  { tier: 2, accepted: 25, rejectDivisor: 10 },
  { tier: 1, accepted: 5, rejectDivisor: 4 },
] as const;

export function tierProgress(w: WorkerInfo): string {
  const lines = [`<b>Your level: tier ${w.tier}</b>`, `${w.accepted} accepted · ${w.rejected} not accepted`];
  const next = [...TIERS].reverse().find((t) => t.tier > w.tier);
  if (!next) return [...lines, "That's the top tier. Thank you for the great work."].join("\n");
  const needMore = Math.max(0, next.accepted - w.accepted);
  const maxRejects = Math.floor(Math.max(w.accepted, next.accepted) / next.rejectDivisor);
  lines.push(`Next, tier ${next.tier}: ${needMore > 0 ? `${needMore} more accepted task${needMore === 1 ? "" : "s"}` : "keep your record clean"}, with no more than about ${maxRejects} not accepted.`);
  return lines.join("\n");
}
