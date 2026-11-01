import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { PrismaClient } from "@eziokwu/db";
import { APP_NAME, formatAmount } from "@eziokwu/shared";
import type { Address } from "viem";
import type { ChainReader } from "./chain";
import { openTasksNear } from "./feed";
import { ASK_LOCATION, CLAIM_LABEL, NEED_SETUP, WELCOME, esc, netReward, taskLine } from "./text";
import { tierProgress } from "./tier";

export interface BotDeps {
  token: string;
  /** Public https address of the Mini App (Vercel). Buttons open pages under it. */
  webAppUrl: string;
  db: PrismaClient;
  chain: ChainReader;
  ngnPerGd: number;
  /** Search radius for "tasks near me", in metres. */
  radiusM?: number;
  /** Tests pass this to skip the getMe call. */
  botInfo?: UserFromGetMe;
}

const SHARE = new Keyboard().requestLocation("📍 Tasks near me").row().text("My tasks").text("Earnings").resized().persistent();

export function createBot(d: BotDeps): Bot {
  const bot = new Bot(d.token, d.botInfo ? { botInfo: d.botInfo } : undefined);
  const radiusM = d.radiusM ?? 10_000;
  const open = (path: string, label: string) => new InlineKeyboard().webApp(label, `${d.webAppUrl}${path}`);

  const linkOf = (telegramId: string) => d.db.link.findUnique({ where: { telegramId } });

  async function touch(ctx: { from?: { id: number }; chat?: { id: number } }) {
    if (!ctx.from) return;
    const telegramId = String(ctx.from.id);
    const chatId = ctx.chat ? String(ctx.chat.id) : null;
    await d.db.user.upsert({ where: { telegramId }, create: { telegramId, chatId }, update: chatId ? { chatId } : {} });
  }

  // Everything the user does counts as being reachable in this chat (needed for nudges).
  bot.use(async (ctx, next) => {
    await touch(ctx);
    await next();
  });

  bot.command("start", async (ctx) => {
    const link = await linkOf(String(ctx.from!.id));
    const info = link ? await d.chain.worker(link.address as Address) : undefined;
    const ready = !!link && !!info?.root;
    await ctx.reply(WELCOME(ready), { parse_mode: "HTML", reply_markup: ready ? SHARE : open("/app", ready ? "Open app" : "Set up in 1 minute") });
    if (ready) await ctx.reply("Tap “Tasks near me” to share your location.", { reply_markup: open("/app", "Open app") });
  });

  bot.command("help", (ctx) =>
    ctx.reply(
      [
        `<b>${APP_NAME}</b> commands`,
        "/tasks: tasks near you",
        "/here 6.60, 3.35: set your location by typing it (for desktop)",
        "/mytasks: your active and past tasks",
        "/earnings: what you've earned",
        "/tier: your level and how to reach the next",
        "/notify on|off: daily message about new tasks near you",
        "/forgetme: delete your saved location",
      ].join("\n"),
      { parse_mode: "HTML" },
    ),
  );

  bot.command("link", (ctx) => ctx.reply("Link your wallet, then verify and approve:", { reply_markup: open("/app", "Open setup") }));

  async function showFeed(ctx: Context, at: { lat: number; lng: number }) {
    const items = await openTasksNear(d.db, d.chain, at, radiusM, 5);
    if (items.length === 0) {
      await ctx.reply(`No open tasks within ${radiusM / 1000} km right now. I'll message you when new ones appear (turn that off with /notify off).`, { reply_markup: SHARE });
      return;
    }
    // One button per row, built as explicit rows (a trailing .row() would leave an empty row Telegram may reject).
    const kb = InlineKeyboard.from(items.map((i) => [InlineKeyboard.webApp(`Open: ${i.task.item ?? i.task.title}`, `${d.webAppUrl}/task/${i.task.bountyId}`)]));
    await ctx.reply(["<b>Tasks near you</b>", ...items.map((i) => taskLine(i, d.ngnPerGd))].join("\n\n"), { parse_mode: "HTML", reply_markup: kb });
  }

  bot.callbackQuery("show-tasks", async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await d.db.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (u?.lat == null || u.lng == null) return void (await ctx.reply(ASK_LOCATION, { reply_markup: SHARE }));
    await showFeed(ctx, { lat: u.lat, lng: u.lng });
  });

  bot.command("tasks", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    if (!(await linkOf(telegramId))) return void (await ctx.reply(NEED_SETUP, { reply_markup: open("/app", "Set up") }));
    const u = await d.db.user.findUnique({ where: { telegramId } });
    if (u?.lat == null || u.lng == null) return void (await ctx.reply(ASK_LOCATION, { reply_markup: SHARE }));
    await showFeed(ctx, { lat: u.lat, lng: u.lng });
  });

  async function useLocation(ctx: Context, lat: number, lng: number) {
    const telegramId = String(ctx.from!.id);
    await d.db.user.update({ where: { telegramId }, data: { lat, lng, locationAt: new Date() } });
    if (!(await linkOf(telegramId))) return void (await ctx.reply(`Got it. ${NEED_SETUP}`, { reply_markup: open("/app", "Set up") }));
    await showFeed(ctx, { lat, lng });
  }

  bot.on("message:location", (ctx) => useLocation(ctx, ctx.message.location.latitude, ctx.message.location.longitude));

  // Telegram's desktop apps cannot send a location, so coordinates typed as text work too:
  // "/here 6.6018, 3.3515" or just "6.6018, 3.3515".
  const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
  const fromText = async (ctx: Context, text: string) => {
    const m = COORDS.exec(text);
    const lat = m ? Number(m[1]) : NaN;
    const lng = m ? Number(m[2]) : NaN;
    if (!m || Math.abs(lat) > 90 || Math.abs(lng) > 180) return void (await ctx.reply("Send coordinates like: /here 6.6018, 3.3515 (latitude, longitude). In Google Maps, long-press a spot to see them."));
    await useLocation(ctx, lat, lng);
  };
  bot.command("here", (ctx) => fromText(ctx, ctx.match));
  bot.hears(COORDS, (ctx) => fromText(ctx, ctx.message!.text!));

  bot.hears("My tasks", (ctx) => myTasks(ctx));
  bot.command("mytasks", (ctx) => myTasks(ctx));
  async function myTasks(ctx: Context) {
    const telegramId = String(ctx.from!.id);
    const claims = await d.db.claim.findMany({ where: { telegramId }, orderBy: { updatedAt: "desc" }, take: 8 });
    if (claims.length === 0) return void (await ctx.reply("You haven't taken a task yet. Send /tasks to find one.", { reply_markup: SHARE }));
    const rows: string[] = [];
    const submitButtons: ReturnType<typeof InlineKeyboard.webApp>[][] = [];
    for (const c of claims) {
      const state = await d.chain.claimState(c.bountyId, c.address as Address); // the chain, not our copy, decides
      const t = await d.db.task.findUnique({ where: { bountyId: c.bountyId } });
      rows.push(`<b>${esc(t?.item ?? t?.title ?? `Task ${c.bountyId}`)}</b>\n${CLAIM_LABEL[state] ?? "Unknown"}`);
      if (state === 1) submitButtons.push([InlineKeyboard.webApp(`Submit: ${t?.item ?? `Task ${c.bountyId}`}`, `${d.webAppUrl}/task/${c.bountyId}`)]);
    }
    await ctx.reply(["<b>Your tasks</b>", ...rows].join("\n\n"), { parse_mode: "HTML", reply_markup: InlineKeyboard.from(submitButtons) });
  }

  bot.hears("Earnings", (ctx) => earnings(ctx));
  bot.command("earnings", (ctx) => earnings(ctx));
  async function earnings(ctx: Context) {
    const telegramId = String(ctx.from!.id);
    const claims = await d.db.claim.findMany({ where: { telegramId }, take: 200 });
    let paid = 0n;
    let paidCount = 0;
    let pending = 0n;
    const bounties = await d.chain.bounties([...new Set(claims.map((c) => c.bountyId))]);
    for (const c of claims) {
      const b = bounties.get(c.bountyId);
      if (!b) continue;
      const state = await d.chain.claimState(c.bountyId, c.address as Address);
      if (state === 3) (paid += netReward(b.reward, b.feeBps)), paidCount++;
      else if (state === 1 || state === 2) pending += netReward(b.reward, b.feeBps);
    }
    await ctx.reply(
      [`<b>Your earnings</b>`, `Paid: ${esc(formatAmount(paid, d.ngnPerGd))} from ${paidCount} task${paidCount === 1 ? "" : "s"}`, `Waiting: ${esc(formatAmount(pending, d.ngnPerGd))}`].join("\n"),
      { parse_mode: "HTML" },
    );
  }

  bot.command("tier", async (ctx) => {
    const link = await linkOf(String(ctx.from!.id));
    if (!link) return void (await ctx.reply(NEED_SETUP, { reply_markup: open("/app", "Set up") }));
    const w = await d.chain.worker(link.address as Address);
    if (!w.root) return void (await ctx.reply("Verify you're a real person first.", { reply_markup: open("/verify", "Verify") }));
    await ctx.reply(tierProgress(w), { parse_mode: "HTML" });
  });

  bot.command("notify", async (ctx) => {
    const arg = ctx.match.trim().toLowerCase();
    if (arg !== "on" && arg !== "off") return void (await ctx.reply("Use /notify on or /notify off."));
    await d.db.user.update({ where: { telegramId: String(ctx.from!.id) }, data: { notify: arg === "on" } });
    await ctx.reply(arg === "on" ? "Okay. I'll message you at most once a day when there are new tasks near you." : "Okay. No more daily messages. Turn them back on with /notify on.");
  });

  bot.command("forgetme", async (ctx) => {
    await d.db.user.update({ where: { telegramId: String(ctx.from!.id) }, data: { lat: null, lng: null, locationAt: null, notify: false } });
    await ctx.reply("Done. Your saved location is deleted and daily messages are off.");
  });

  bot.catch((err) => console.error("bot error", err.error));
  return bot;
}
