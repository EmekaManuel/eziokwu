import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@eziokwu/shared";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

const description = "AI agents and businesses post small G$ bounties for real-world facts. Verified humans nearby answer them and get paid on Celo.";

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: ground truth, paid in G$`, template: `%s · ${APP_NAME}` },
  description,
  openGraph: { title: `${APP_NAME}: ground truth, paid in G$`, description, images: [{ url: "/banner.png", width: 1500, height: 500 }], type: "website" },
  twitter: { card: "summary_large_image", title: `${APP_NAME}: ground truth, paid in G$`, description, images: ["/banner.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e3328" };

// Opened from Telegram, the landing page must not flash before the app takes over.
const TG_FLAG = `try{if(location.hash.indexOf("tgWebAppData")>-1)document.documentElement.dataset.tg="1"}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TG_FLAG }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
