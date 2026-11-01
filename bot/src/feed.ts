import { tasksNear, type NearTask, type PrismaClient } from "@eziokwu/db";
import type { BountyInfo, ChainReader } from "./chain";

export interface FeedItem {
  task: NearTask;
  bounty: BountyInfo;
}

/** Posted tasks near a point that can still be claimed (open slot, deadline not passed), nearest first. */
export async function openTasksNear(db: PrismaClient, chain: ChainReader, at: { lat: number; lng: number }, radiusM: number, limit = 5): Promise<FeedItem[]> {
  // Fetch extra rows: some nearby tasks will be full or expired and get filtered out below.
  const near = await tasksNear(db, at, radiusM, limit * 4);
  const bounties = await chain.bounties(near.map((t) => t.bountyId!));
  const items: FeedItem[] = [];
  for (const task of near) {
    const bounty = bounties.get(task.bountyId!);
    if (bounty && bounty.openSlots > 0) items.push({ task, bounty });
    if (items.length === limit) break;
  }
  return items;
}
