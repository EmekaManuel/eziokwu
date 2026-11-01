import Script from "next/script";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Providers } from "../providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <Providers>
        <AppShell>{children}</AppShell>
      </Providers>
    </>
  );
}
