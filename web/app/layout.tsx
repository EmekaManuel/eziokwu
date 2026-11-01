import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { APP_NAME } from "@eziokwu/shared";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = { title: APP_NAME, description: "Get paid in G$ for real-world facts." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
