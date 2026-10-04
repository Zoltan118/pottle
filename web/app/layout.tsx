import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "./providers";
import { Tips } from "@/components/Tips";
import { NETWORK, SITE, X_HANDLE } from "@/lib/config";
import { wrapCss } from "@/lib/wraps";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display" }); // opsz keeps giant type tight
const body = Figtree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-body" });

const description = "a pot for the group chat. set a goal and a deadline, share one link. hit the goal and it goes to the organiser; miss it and everyone gets their money back, automatically. usdc and eurc on arc.";
// a measurement id like G-ABC123, checked before it goes into the page's script
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(process.env.NEXT_PUBLIC_GA_ID ?? "") ? process.env.NEXT_PUBLIC_GA_ID : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "pottle · chip in, or get it back",
  description,
  openGraph: { title: "pottle · chip in, or get it back", description, siteName: "pottle", type: "website" },
  twitter: { card: "summary_large_image", site: `@${X_HANDLE}`, title: "pottle · chip in, or get it back", description },
  appleWebApp: { title: "pottle", statusBarStyle: "default" },
  // the test site stays out of search, so people find the real one
  ...(NETWORK === "testnet" ? { robots: { index: false, follow: true } } : {}),
};

// safari's toolbar and the status bar take the page's own paper colour, light and dark
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F3FA" },
    { media: "(prefers-color-scheme: dark)", color: "#15101E" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {/* the themed wraps' backgrounds, generated from the same tiles the link previews use */}
        <style dangerouslySetInnerHTML={{ __html: wrapCss }} />
        <Providers>{children}</Providers>
        {/* google analytics, only where NEXT_PUBLIC_GA_ID is set. consent defaults to denied, so it stores no
            cookies and uses no ad features: google gets cookieless page views only, which needs no cookie banner */}
        {GA_ID && <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());
gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}</Script>
        </>}
        <Tips />
        {/* vercel web analytics: cookieless page views, counted in the vercel dashboard once enabled there */}
        <Analytics />
      </body>
    </html>
  );
}
