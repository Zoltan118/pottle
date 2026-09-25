import { ImageResponse } from "next/og";
import { ogFont } from "@/lib/ogfont";

export const alt = "pottle. chip in, or get it back.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ink = "#231A33", paper = "#F1ECF7", pink = "#FF8AAE", gold = "#F2B32A", muted = "#B3A9C4";

export default async function Image() {
  const bold = await ogFont(800);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: ink, color: paper, display: "flex", padding: 80, fontFamily: "Bricolage", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2 }}>pottle</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -8, lineHeight: 0.9 }}>chip in.</div>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -3, color: pink, marginTop: 14 }}>or get it back.</div>
          </div>
          <div style={{ fontSize: 30, color: muted }}>a pot for the group chat · usdc on arc</div>
        </div>
        <svg width="340" height="340" viewBox="0 0 96 96">
          <defs><clipPath id="c"><circle cx="48" cy="57" r="23" /></clipPath></defs>
          <rect x="17" y="17" width="62" height="12" rx="6" fill={paper} />
          <rect x="20" y="57" width="56" height="30" fill={gold} clipPath="url(#c)" />
          <circle cx="48" cy="57" r="27" fill="none" stroke={paper} strokeWidth="8" />
        </svg>
      </div>
    ),
    { ...size, fonts: bold ? [{ name: "Bricolage", data: bold, weight: 800, style: "normal" }] : [] },
  );
}
