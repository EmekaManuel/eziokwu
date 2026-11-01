import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type PrismaClient } from "@eziokwu/db";
import { hashTask, type TaskSpec } from "@eziokwu/shared";
import { startTestPostgres } from "../../db/src/testing";
import { createBot, sendNudges, type BountyInfo, type ChainReader, type WorkerInfo } from "../src";
import type { Bot } from "grammy";

const WEB = "https://app.example";
const ETH = 10n ** 18n;
const WORKER = "0x00000000000000000000000000000000000000a1";
const nowSec = () => Math.floor(Date.now() / 1000);

let pg: Awaited<ReturnType<typeof startTestPostgres>>;
let db: PrismaClient;
beforeAll(async () => {
  pg = await startTestPostgres();
  db = createDb(pg.url);
});
afterAll(async () => {
  await db?.$disconnect();
  pg?.stop();
});

// ---- a fake chain -------------------------------------------------------------------------------
const bountiesOnChain = new Map<number, BountyInfo>();
const claimStates = new Map<string, number>();
let workerInfo: WorkerInfo = { root: WORKER, tier: 0, accepted: 0, rejected: 0 };
const chain: ChainReader = {
  async bounties(ids) {
    return new Map(ids.flatMap((i) => (bountiesOnChain.has(i) ? [[i, bountiesOnChain.get(i)!] as const] : [])));
  },
  async claimState(id, w) {
    return claimStates.get(`${id}:${w.toLowerCase()}`) ?? 0;
  },
  async worker() {
    return workerInfo;
  },
};

const bounty = (o: Partial<BountyInfo> = {}): BountyInfo => ({ reward: 100n * ETH, feeBps: 300, bond: 0n, answersNeeded: 1, minTier: 0, deadline: BigInt(nowSec() + 7200), openSlots: 1, ...o });

// ---- a bot with Telegram's network replaced by a recorder -------------------------------------------
type Call = { method: string; payload: any };
let calls: Call[];
let bot: Bot;
let updateId = 1;
const lastText = () => calls.filter((c) => c.method === "sendMessage").at(-1)?.payload.text as string;
const lastMarkup = () => calls.filter((c) => c.method === "sendMessage").at(-1)?.payload.reply_markup;

function makeBot() {
  const b = createBot({ token: "123:test", webAppUrl: WEB, db, chain, ngnPerGd: 0.15, botInfo: { id: 1, is_bot: true, first_name: "E", username: "ezk_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as never });
  b.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: true } as never;
  });
  return b;
}
async function say(text: string, from = 7) {
  const entities = text.startsWith("/") ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] : undefined;
  await bot.handleUpdate({ update_id: updateId++, message: { message_id: updateId, date: nowSec(), chat: { id: from, type: "private" }, from: { id: from, is_bot: false, first_name: "T" }, text, entities } } as never);
}
async function shareLocation(lat: number, lng: number, from = 7) {
  await bot.handleUpdate({ update_id: updateId++, message: { message_id: updateId, date: nowSec(), chat: { id: from, type: "private" }, from: { id: from, is_bot: false, first_name: "T" }, location: { latitude: lat, longitude: lng } } } as never);
}

const spec = (title: string, lat: number, lng: number): TaskSpec => ({ kind: "price", title, description: title, item: title, unit: "bag", currency: "NGN", marketName: "Mile 12", city: "Lagos", lat, lng, radiusM: 5000 });
async function addTask(bountyId: number, title: string, lat: number, lng: number) {
  const s = spec(title, lat, lng);
  await db.task.create({ data: { ...s, bountyId, specHash: hashTask(s) } });
}

beforeEach(async () => {
  await db.$transaction([db.claim.deleteMany(), db.task.deleteMany(), db.link.deleteMany(), db.user.deleteMany()]);
  bountiesOnChain.clear();
  claimStates.clear();
  workerInfo = { root: WORKER, tier: 0, accepted: 0, rejected: 0 };
  calls = [];
  bot = makeBot();
});

const linkUser = (tg = "7") => db.link.create({ data: { telegramId: tg, address: WORKER } });

describe("onboarding", () => {
  it("/start sends a new user to set up, with a button into the Mini App", async () => {
    await say("/start");
    expect(lastText()).toContain("Setup takes about a minute");
    expect(lastMarkup().inline_keyboard[0][0].web_app.url).toBe(`${WEB}/app`);
    expect(await db.user.findUnique({ where: { telegramId: "7" } })).toMatchObject({ chatId: "7", notify: true });
  });
  it("/start for a verified, linked user offers the location button", async () => {
    await linkUser();
    await say("/start");
    expect(JSON.stringify(calls.filter((c) => c.method === "sendMessage")[0]!.payload.reply_markup)).toContain("request_location");
  });
  it("/tasks without setup points to setup, and without a location asks for one", async () => {
    await say("/tasks");
    expect(lastText()).toContain("Finish setup");
    await linkUser();
    await say("/tasks");
    expect(lastText()).toContain("Share your location");
    expect(JSON.stringify(lastMarkup())).toContain("request_location");
  });
});

describe("location feed", () => {
  it("shows open tasks nearest first, hides full and expired ones, and shows what the worker actually gets", async () => {
    await linkUser();
    await addTask(1, "Rice", 6.6018, 3.3515);
    await addTask(2, "Beans", 6.61, 3.36);
    await addTask(3, "Full task", 6.6019, 3.3516);
    await addTask(4, "Expired", 6.6019, 3.3517);
    await addTask(5, "Far away", 7.3775, 3.947);
    bountiesOnChain.set(1, bounty());
    bountiesOnChain.set(2, bounty());
    bountiesOnChain.set(3, bounty({ openSlots: 0 }));
    bountiesOnChain.set(4, bounty({ openSlots: 0, deadline: BigInt(nowSec() - 5) }));
    bountiesOnChain.set(5, bounty());
    await shareLocation(6.6018, 3.3515);
    const text = lastText();
    expect(text.indexOf("Rice")).toBeLessThan(text.indexOf("Beans"));
    expect(text).not.toContain("Full task");
    expect(text).not.toContain("Expired");
    expect(text).not.toContain("Far away");
    expect(text).toContain("97 G$"); // 100 minus the 3% fee
    expect(lastMarkup().inline_keyboard.map((r: any) => r[0].web_app.url)).toEqual([`${WEB}/task/1`, `${WEB}/task/2`]);
    expect(await db.user.findUnique({ where: { telegramId: "7" } })).toMatchObject({ lat: 6.6018, lng: 3.3515 });
  });
  it("accepts typed coordinates (for desktop), and rejects nonsense", async () => {
    await linkUser();
    await addTask(1, "Rice", 6.6018, 3.3515);
    bountiesOnChain.set(1, bounty());
    await say("/here 6.6018, 3.3515");
    expect(lastText()).toContain("Rice");
    await say("6.6020 3.3510"); // plain message, space separated
    expect(lastText()).toContain("Rice");
    await say("/here 95, 3");
    expect(lastText()).toContain("Send coordinates like");
    await say("/here lagos");
    expect(lastText()).toContain("Send coordinates like");
    await say("/start");
    await say("hello there"); // ordinary chat is ignored
    expect(lastText()).not.toContain("Send coordinates");
  });
  it("says so when nothing is open nearby", async () => {
    await linkUser();
    await shareLocation(0, 0);
    expect(lastText()).toContain("No open tasks");
  });
  it("escapes task text, so a task cannot inject markup", async () => {
    await linkUser();
    await addTask(9, "<b>evil</b> & co", 6.6018, 3.3515);
    bountiesOnChain.set(9, bounty());
    await shareLocation(6.6018, 3.3515);
    expect(lastText()).toContain("&lt;b&gt;evil&lt;/b&gt; &amp; co");
  });
});

describe("my tasks, earnings, tier", () => {
  it("/mytasks takes each state from the chain and offers Submit only for a task in progress", async () => {
    await linkUser();
    await addTask(1, "Rice", 6.6, 3.35);
    await addTask(2, "Beans", 6.6, 3.35);
    await db.claim.createMany({ data: [{ bountyId: 1, address: WORKER, telegramId: "7", state: "claimed" }, { bountyId: 2, address: WORKER, telegramId: "7", state: "claimed" }] });
    claimStates.set(`1:${WORKER}`, 1);
    claimStates.set(`2:${WORKER}`, 3); // our row is stale; the chain says accepted
    await say("/mytasks");
    expect(lastText()).toContain("Accepted and paid");
    expect(lastText()).toContain("In progress");
    const buttons = lastMarkup().inline_keyboard;
    expect(buttons).toHaveLength(1);
    expect(buttons[0][0].web_app.url).toBe(`${WEB}/task/1`);
  });
  it("/earnings adds up only accepted tasks, net of the fee", async () => {
    await linkUser();
    await db.claim.createMany({ data: [1, 2, 3].map((n) => ({ bountyId: n, address: WORKER, telegramId: "7", state: "claimed" })) });
    for (const n of [1, 2, 3]) bountiesOnChain.set(n, bounty());
    claimStates.set(`1:${WORKER}`, 3);
    claimStates.set(`2:${WORKER}`, 3);
    claimStates.set(`3:${WORKER}`, 2);
    await say("/earnings");
    expect(lastText()).toContain("Paid: 194 G$"); // 2 x 97
    expect(lastText()).toContain("from 2 tasks");
    expect(lastText()).toContain("Waiting: 97 G$");
  });
  it("/tier explains the next step", async () => {
    await linkUser();
    workerInfo = { root: WORKER, tier: 0, accepted: 3, rejected: 0 };
    await say("/tier");
    expect(lastText()).toContain("tier 0");
    expect(lastText()).toContain("2 more accepted tasks");
    workerInfo = { root: null, tier: 0, accepted: 0, rejected: 0 };
    await say("/tier");
    expect(lastText()).toContain("Verify you're a real person");
  });
});

describe("privacy and daily nudge", () => {
  it("/forgetme deletes the location and turns messages off", async () => {
    await linkUser();
    await shareLocation(6.6, 3.35);
    await say("/forgetme");
    expect(await db.user.findUnique({ where: { telegramId: "7" } })).toMatchObject({ lat: null, lng: null, notify: false });
  });

  async function setUpNudgeUser() {
    await linkUser();
    await addTask(1, "Rice", 6.6018, 3.3515);
    bountiesOnChain.set(1, bounty());
    await shareLocation(6.6018, 3.3515);
    calls = [];
  }
  const nudge = (now?: number) => sendNudges(bot, { db, chain, webAppUrl: WEB, now, paceMs: 0 });

  it("sends one message, then not again within a day, then again after a day", async () => {
    await setUpNudgeUser();
    expect(await nudge()).toBe(1);
    expect(lastText()).toContain("1 open task");
    expect(lastText()).toContain("/notify off");
    expect(await nudge()).toBe(0);
    expect(await nudge(Date.now() + 21 * 3600_000)).toBe(1);
  });
  it("does not message someone who turned it off, has no location, or has no tasks near them", async () => {
    await setUpNudgeUser();
    await say("/notify off");
    expect(await nudge()).toBe(0);
    await say("/notify on");
    await shareLocation(0, 0); // nothing open there
    expect(await nudge()).toBe(0);
  });
  it("switches off a user who blocked the bot", async () => {
    await setUpNudgeUser();
    bot.api.config.use(async (prev, method, payload) => {
      if (method === "sendMessage") throw Object.assign(new Error("Forbidden: bot was blocked by the user"), { error_code: 403 });
      return prev(method, payload);
    });
    expect(await nudge()).toBe(0);
    expect(await db.user.findUnique({ where: { telegramId: "7" } })).toMatchObject({ notify: false });
  });
});
