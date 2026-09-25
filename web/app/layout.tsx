import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "./providers";
import { Tips } from "@/components/Tips";
import { SITE } from "@/lib/config";
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
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <Tips />
      </body>
    </html>
  );
}
