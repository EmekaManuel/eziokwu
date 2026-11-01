import type { PrismaClient, Task } from "@prisma/client";
import { distanceMeters } from "@eziokwu/shared";

export interface NearTask extends Task {
  distanceM: number;
}

/**
 * Tasks posted on-chain (bountyId set) within `radiusM` of a point, nearest first.
 * A cheap bounding box narrows the rows in SQL; exact haversine distance is then applied here.
 * `lat`/`lng` of the task is the task's location; `radiusM` is the search radius, not the task's own radius.
 */
export async function tasksNear(db: PrismaClient, at: { lat: number; lng: number }, radiusM: number, limit = 20): Promise<NearTask[]> {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((at.lat * Math.PI) / 180)));
  const rows = await db.task.findMany({
    where: { bountyId: { not: null }, lat: { gte: at.lat - dLat, lte: at.lat + dLat }, lng: { gte: at.lng - dLng, lte: at.lng + dLng } },
    take: 500,
  });
  return rows
    .map((t) => ({ ...t, distanceM: distanceMeters(at, t) }))
    .filter((t) => t.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
