import { ImageResponse } from "next/og";
import { C, Frame, OG, ogFonts, Pot, Wordmark } from "@/lib/ogart";

export const alt = "pottle. chip in, or get it back.";
export const size = OG;
export const contentType = "image/png";

// the preview when someone shares pottle itself: the promise, and a pot on its way to full
export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(
    <Frame wrap="confetti">
      <Wordmark size={48} />
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, letterSpacing: -8, lineHeight: 0.9 }}>chip in.</div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 800, letterSpacing: -3.5, color: C.ribbonText, marginTop: 14 }}>or get it back.</div>
        </div>
        <Pot level={0.62} size={270} />
      </div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: C.muted }}>a pot for the group chat. hit the goal or everyone gets it back.</div>
    </Frame>,
    { ...size, fonts },
  );
}
