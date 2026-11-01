"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
import { APP_NAME } from "@eziokwu/shared";
import { LogoMark } from "@/components/Logo";
import { webApp } from "@/lib/telegram";

const TITLES: Record<string, string> = { "/link": "Link wallet", "/verify": "Verify", "/approve": "Allow G$" };

/** Top bar for every in-app screen: brand on the home screen, a back button everywhere else. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/app";

  const goBack = useCallback(() => {
    // A deep link can be the first page in the history, so fall back to home.
    if (window.history.length > 1) router.back();
    else router.push("/app");
  }, [router]);

  // Telegram's own back button (top-left of the Mini App) does the same thing.
  useEffect(() => {
    const b = webApp()?.BackButton;
    if (!b) return;
    if (isHome) {
      b.hide();
      return;
    }
    b.show();
    b.onClick(goBack);
    return () => b.offClick(goBack);
  }, [isHome, goBack]);

  const title = pathname.startsWith("/task/") ? `Task ${pathname.split("/")[2]}` : (TITLES[pathname] ?? APP_NAME);

  return (
    <div className="shell">
      <header className="topbar">
        {isHome ? (
          <span className="brand">
            <LogoMark size={22} />
            {APP_NAME}
          </span>
        ) : (
          <>
            <button className="back" onClick={goBack} aria-label="Go back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              Back
            </button>
            <span className="topbar-title">{title}</span>
            <span className="topbar-spacer" />
          </>
        )}
      </header>
      <main className="screen">{children}</main>
    </div>
  );
}
