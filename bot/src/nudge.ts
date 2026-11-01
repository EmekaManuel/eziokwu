import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { PrismaClient } from "@eziokwu/db";
import type { ChainReader } from "./chain";
import { openTasksNear } from "./feed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends at most one "new tasks near you" message per user per ~day, only to people who shared a location, have
 * not turned it off, and have at least one open task near them. A user who blocked the bot is switched off.
 * Returns how many messages were sent.
 */
export async function sendNudges(
  bot: Bot,
  d: { db: PrismaClient; chain: ChainReader; webAppUrl: string; radiusM?: number; now?: number; paceMs?: number },
): Promise<number> {
  const now = d.now ?? Date.now();
  const users = await d.db.user.findMany({
    where: { notify: true, chatId: { not: null }, lat: { not: null }, lng: { not: null }, OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: new Date(now - 20 * 60 * 60 * 1000) } }] },
    take: 1000,
  });
  let sent = 0;
  for (const u of users) {
    if (!(await d.db.link.findUnique({ where: { telegramId: u.telegramId } }))) continue; // only people who can actually take tasks
    const items = await openTasksNear(d.db, d.chain, { lat: u.lat!, lng: u.lng! }, d.radiusM ?? 10_000, 5);
    if (items.length === 0) continue;
    try {
      await bot.api.sendMessage(
        u.chatId!,
        `${items.length === 1 ? "There is 1 open task" : `There are ${items.length} open tasks`} near you.\n\nStop these messages any time with /notify off.`,
        { reply_markup: new InlineKeyboard().text("Show me", "show-tasks") },
      );
      await d.db.user.update({ where: { telegramId: u.telegramId }, data: { lastNudgeAt: new Date(now) } });
      sent++;
    } catch (e) {
      const code = (e as { error_code?: number }).error_code;
      if (code === 403) await d.db.user.update({ where: { telegramId: u.telegramId }, data: { notify: false } }); // blocked us
      else console.error("nudge failed", u.telegramId, e);
    }
    await sleep(d.paceMs ?? 50); // stay far below Telegram's ~30 messages/second limit
  }
  return sent;
}
