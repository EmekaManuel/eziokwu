import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashTask, type TaskSpec } from "@eziokwu/shared";
import { createDb, tasksNear } from "../src";
import { startTestPostgres } from "../src/testing";

let pg: Awaited<ReturnType<typeof startTestPostgres>>;
const db = () => dbc;
let dbc: ReturnType<typeof createDb>;

const spec = (title: string, lat: number, lng: number): TaskSpec => ({ kind: "price", title, description: title, item: null, unit: null, currency: "NGN", marketName: null, city: null, lat, lng, radiusM: 5000 });

beforeAll(async () => {
  pg = await startTestPostgres();
  dbc = createDb(pg.url);
});
afterAll(async () => {
  await dbc?.$disconnect();
  pg?.stop();
});

describe("tasksNear", () => {
  it("returns only posted tasks inside the radius, nearest first", async () => {
    const rows: [string, number, number, number | null][] = [
      ["far (Ibadan)", 7.3775, 3.947, 1],
      ["near A", 6.6018, 3.3515, 2],
      ["near B", 6.605, 3.355, 3],
      ["not posted yet", 6.6019, 3.3516, null],
    ];
    for (const [title, lat, lng, bountyId] of rows) {
      const s = spec(title, lat, lng);
      await db().task.create({ data: { ...s, bountyId, specHash: hashTask(s) } });
    }
    const found = await tasksNear(db(), { lat: 6.6018, lng: 3.3515 }, 10_000);
    expect(found.map((t) => t.title)).toEqual(["near A", "near B"]);
    expect(found[0]!.distanceM).toBeLessThan(found[1]!.distanceM);
    expect(await tasksNear(db(), { lat: 6.6018, lng: 3.3515 }, 100)).toHaveLength(1);
    expect(await tasksNear(db(), { lat: 0, lng: 0 }, 10_000)).toHaveLength(0);
  });
  it("rejects two tasks with the same spec hash", async () => {
    const s = spec("dup", 6.7, 3.4);
    await db().task.create({ data: { ...s, specHash: hashTask(s) } });
    await expect(db().task.create({ data: { ...s, specHash: hashTask(s) } })).rejects.toThrow();
  });
});
