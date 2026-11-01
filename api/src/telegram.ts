import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: string;
  username?: string;
  firstName?: string;
}

/**
 * Validates Telegram Mini App `initData` per https://core.telegram.org/bots/webapps#validating-data
 * Returns the user, or throws. Uses the bot token as the HMAC secret source, so only our bot's
 * Mini App can produce valid data.
 */
export function verifyInitData(initData: string, botToken: string, maxAgeSeconds: number, now = Date.now()): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData: missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();

  let given: Buffer;
  try {
    given = Buffer.from(hash, "hex");
  } catch {
    throw new Error("initData: bad hash");
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("initData: bad signature");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("initData: missing auth_date");
  const age = now / 1000 - authDate;
  if (age > maxAgeSeconds || age < -60) throw new Error("initData: expired");

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("initData: missing user");
  const u = JSON.parse(userRaw) as { id: number | string; username?: string; first_name?: string };
  if (u.id === undefined || u.id === null) throw new Error("initData: missing user id");
  return { id: String(u.id), username: u.username, firstName: u.first_name };
}

/** Test helper: builds valid initData for a user (exported so other packages' tests can reuse it). */
export function signInitData(user: { id: number; username?: string; first_name?: string }, botToken: string, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user), query_id: "test" });
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}
