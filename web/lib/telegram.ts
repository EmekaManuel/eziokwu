interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number } };
  ready(): void;
  expand(): void;
  openLink(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function webApp(): TelegramWebApp | undefined {
  return typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
}

/** The signed initData string the API verifies; empty outside Telegram. */
export function getInitData(): string {
  return webApp()?.initData ?? "";
}

export function initTelegram() {
  const w = webApp();
  w?.ready();
  w?.expand();
}

/** Opens a URL outside the Mini App (needed for the face-verification page, which needs the camera). */
export function openExternal(url: string) {
  const w = webApp();
  if (w) w.openLink(url);
  else window.open(url, "_blank");
}

/** Numeric Telegram user id (display/signing only; the API re-derives it from verified initData). */
export function getTelegramId(): string | undefined {
  const id = webApp()?.initDataUnsafe?.user?.id;
  return id === undefined ? undefined : String(id);
}
