import type { Bot } from "grammy";
import type { PrismaClient } from "@eziokwu/db";
import type { ChainReader } from "./chain";
import { sendNudges } from "./nudge";

/** Starts long polling and the hourly check that sends the daily nudge at `nudgeHourUtc`. Returns a stop function. */
export async function startBot(bot: Bot, d: { db: PrismaClient; chain: ChainReader; webAppUrl: string; nudgeHourUtc: number }): Promise<() => Promise<void>> {
  await bot.api.setMyCommands([
    { command: "tasks", description: "Tasks near you" },
    { command: "mytasks", description: "Your active and past tasks" },
    { command: "earnings", description: "What you've earned" },
    { command: "tier", description: "Your level" },
    { command: "notify", description: "Daily messages on or off" },
    { command: "help", description: "All commands" },
  ]);
  let lastRunDay = "";
  const timer = setInterval(() => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== d.nudgeHourUtc || day === lastRunDay) return;
    lastRunDay = day;
    sendNudges(bot, d).then((n) => console.log(`nudges sent: ${n}`), (e) => console.error("nudge run failed", e));
  }, 60_000);
  void bot.start({ onStart: (me) => console.log(`bot @${me.username} polling`) });
  return async () => {
    clearInterval(timer);
    await bot.stop();
  };
}
