import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "./providers";
import { Tips } from "@/components/Tips";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display" }); // opsz keeps giant type tight
const body = Figtree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "pottle · chip in, or get it back",
  description: "a pot for the group chat. everyone's in, or everyone's refunded. usdc on arc.",
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
