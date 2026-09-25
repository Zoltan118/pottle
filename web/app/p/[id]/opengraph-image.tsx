import { ImageResponse } from "next/og";
import { money, readPot, timeLeft } from "@/lib/pot";
import { ogFont } from "@/lib/ogfont";

export const alt = "a pottle pot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// the group-chat preview: the one surface most people see before they open the pot
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const pot = await readPot(Number((await params).id)).catch(() => null);
  const bold = await ogFont(800);
  const ink = "#231A33", paper = "#F1ECF7", muted = "#B3A9C4", gold = "#F2B32A";
  const pct = pot ? Math.min(1, pot.raised / pot.goal) : 0;
  const state = !pot ? "" : pot.status === "released" ? "it's on" : pot.status === "refunding" ? "refunded" : pot.status === "reached" ? "goal hit" : timeLeft(pot.deadline);

  // after a pot pays out, its preview becomes the thank-you card
  if (pot && pot.status === "released") {
    const names = pot.people.map((p) => p.name);
    const shown = names.slice(0, 12).join(" · ") + (names.length > 12 ? ` · +${names.length - 12}` : "");
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", background: ink, color: paper, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, fontFamily: "Bricolage" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -2 }}>pottle</div>
            <div style={{ fontSize: 32, color: gold }}>thank you</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -4, lineHeight: 0.95, display: "flex" }}>
              {`${names.length} friend${names.length === 1 ? "" : "s"} chipped in ${money(pot.raised, pot.currency)}`}
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, color: gold, display: "flex" }}>{`for ${pot.title}`}</div>
          </div>
          <div style={{ fontSize: 30, color: muted, display: "flex" }}>{shown}</div>
        </div>
      ),
      { ...size, fonts: bold ? [{ name: "Bricolage", data: bold, weight: 800, style: "normal" }] : [] },
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: ink, color: paper, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, fontFamily: "Bricolage" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -2 }}>pottle</div>
          <div style={{ fontSize: 32, color: muted }}>{state}</div>
        </div>
        <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -5, lineHeight: 0.95, display: "flex" }}>{pot?.title ?? "chip in. or get it back."}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", height: 28, borderRadius: 99, background: "#3A2F4C", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(4, pct * 100)}%`, background: gold, borderRadius: 99 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40, color: "#D9D1E4" }}>
            <span>{pot ? `${pot.people.length} in` : ""}</span>
            <span>{pot ? `${money(pot.raised, pot.currency)} of ${money(pot.goal, pot.currency)}` : ""}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: bold ? [{ name: "Bricolage", data: bold, weight: 800, style: "normal" }] : [] },
  );
}
