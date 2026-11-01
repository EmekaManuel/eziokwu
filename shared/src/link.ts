import { APP_NAME } from "./config";

/** The exact text a worker signs to link a wallet to a Telegram account. */
export function linkMessage(telegramId: string | number | bigint, nonce: string): string {
  return `${APP_NAME} link:${telegramId}:${nonce}`;
}
