import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "./providers";
import { Tips } from "@/components/Tips";
import { TestnetStrip } from "@/components/NetSwitch";
import { NETWORK, SITE } from "@/lib/config";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display" }); // opsz keeps giant type tight
const body = Figtree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-body" });

const description = "a pot for the group chat. set a goal and a deadline, share one link. hit the goal and it goes to the organiser; miss it and everyone gets their money back, automatically. usdc and eurc on arc.";
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "pottle · chip in, or get it back",
  description,
  openGraph: { title: "pottle · chip in, or get it back", description, siteName: "pottle", type: "website" },
  twitter: { card: "summary_large_image", title: "pottle · chip in, or get it back", description },
  appleWebApp: { title: "pottle", statusBarStyle: "default" },
};

// safari's toolbar and the status bar match the top of the page: the paper, or the testnet strip
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: NETWORK === "mainnet"
    ? [
        { media: "(prefers-color-scheme: light)", color: "#F6F3FA" },
        { media: "(prefers-color-scheme: dark)", color: "#15101E" },
      ]
    : "#F2B32A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <TestnetStrip />
        <Providers>{children}</Providers>
        <Tips />
      </body>
    </html>
  );
}
