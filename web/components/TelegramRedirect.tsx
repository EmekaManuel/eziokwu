"use client";

import { useEffect } from "react";

/** Opened from the bot, "/" hands over to the app (keeping Telegram's launch data in the URL hash). */
export function TelegramRedirect() {
  useEffect(() => {
    if (location.hash.includes("tgWebAppData")) location.replace(`/app${location.hash}`);
  }, []);
  return null;
}
