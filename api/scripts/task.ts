// Dev helper: write a task description to the database and link it to a bounty once that bounty exists.
//   tsx scripts/task.ts create --title "Rice price" --item "Rice, 50 kg bag" --unit bag --lat 6.6018 --lng 3.3515 \
//       [--description "..."] [--market "Mile 12"] [--city Lagos] [--radius 5000]      -> prints SPEC_HASH
//   tsx scripts/task.ts link <specHash> <bountyId>
import { parseArgs } from "node:util";
import { createDb } from "@eziokwu/db";
import { hashTask, type TaskSpec } from "@eziokwu/shared";

const [cmd, ...rest] = process.argv.slice(2);
const db = createDb();

if (cmd === "create") {
  const { values: v } = parseArgs({
    args: rest,
    options: { title: { type: "string" }, description: { type: "string" }, item: { type: "string" }, unit: { type: "string" }, market: { type: "string" }, city: { type: "string" }, lat: { type: "string" }, lng: { type: "string" }, radius: { type: "string" } },
  });
  if (!v.title || !v.lat || !v.lng) throw new Error("--title, --lat and --lng are required");
  const spec: TaskSpec = {
    kind: "price",
    title: v.title,
    description: v.description ?? `Find the current price of ${v.item ?? v.title} at your nearest market and tell us what you paid or were quoted.`,
    item: v.item ?? null,
    unit: v.unit ?? null,
    currency: "NGN",
    marketName: v.market ?? null,
    city: v.city ?? null,
    lat: Number(v.lat),
    lng: Number(v.lng),
    radiusM: Number(v.radius ?? 5000),
  };
  const specHash = hashTask(spec);
  await db.task.upsert({ where: { specHash }, create: { ...spec, specHash }, update: {} });
  console.log(specHash);
} else if (cmd === "link") {
  const [specHash, bountyId] = rest;
  if (!specHash || !bountyId) throw new Error("usage: link <specHash> <bountyId>");
  await db.task.update({ where: { specHash }, data: { bountyId: Number(bountyId) } });
  console.error(`task ${specHash.slice(0, 10)}… is now bounty #${bountyId}`);
} else {
  throw new Error("usage: create ... | link <specHash> <bountyId>");
}
await db.$disconnect();
