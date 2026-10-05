import { ImageResponse } from "next/og";
import { money, readPot, timeLeft } from "@/lib/pot";
import { readPotParam } from "@/lib/potLink";
import { C, Frame, OG, ogFonts, Pill, Pot, titleSize, Wordmark } from "@/lib/ogart";

export const alt = "a pottle pot";
export const size = OG;
export const contentType = "image/png";

// the group-chat preview: the one surface most people see before they open the pot. it looks like
// the pot page itself: the pot's own wrap, a paper card, the pot filled to the real amount
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  // the preview only shows a pot to a full link; a bare number gets the plain pottle card
  const link = readPotParam((await params).id);
  const pot = link.state === "ok" ? await readPot(link.id).catch(() => null) : null;
  const fonts = await ogFonts();
  if (!pot) {
    return new ImageResponse(
      <Frame wrap="confetti">
        <Wordmark size={52} />
        <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 96, fontWeight: 800, letterSpacing: -4 }}>chip in. or get it back.</div>
      </Frame>,
      { ...size, fonts },
    );
  }

  const m = (d: number) => money(d, pot.currency);
  const level = pot.goal ? pot.raised / pot.goal : 0;
  const people = pot.people.filter((p) => p.amount > 0 || pot.status === "released");
  const faces = people.slice(0, 6);

  // paid out: the thank-you card. the same layout as an open pot, now full, with everyone's names
  if (pot.status === "released") {
    const names = pot.people.map((p) => p.name);
    const shown = names.slice(0, 10).join(" · ") + (names.length > 10 ? ` · +${names.length - 10}` : "");
    return new ImageResponse(
      <Frame wrap={pot.wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark />
          <Pill tone="ok">thank you</Pill>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 36 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
            <div style={{ display: "flex", fontSize: titleSize(pot.title), fontWeight: 800, letterSpacing: -titleSize(pot.title) * 0.045, lineHeight: 0.95 }}>{pot.title}</div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: C.ribbonText, letterSpacing: -0.6 }}>
              {`${names.length} friend${names.length === 1 ? "" : "s"} chipped in. it went to ${pot.organiserName}.`}
            </div>
          </div>
          <Pot level={1} size={230} face="stars" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
          <span style={{ fontSize: 88, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>{m(pot.raised)}</span>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: C.muted, textAlign: "right" }}>{shown}</div>
        </div>
      </Frame>,
      { ...size, fonts },
    );
  }

  const refunded = pot.status === "refunding";
  const state = refunded ? "refunded" : pot.status === "reached" ? "goal hit" : timeLeft(pot.deadline);
  return new ImageResponse(
    <Frame wrap={pot.wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark />
        <Pill tone={refunded ? "back" : pot.status === "reached" ? "ok" : "ink"}>{state}</Pill>
      </div>

      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
          <div style={{ display: "flex", fontSize: titleSize(pot.title), fontWeight: 800, letterSpacing: -titleSize(pot.title) * 0.045, lineHeight: 0.95 }}>{pot.title}</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: C.muted, letterSpacing: -0.6 }}>
            {refunded ? "missed. everyone got their money back" : <>{`${pot.organiserName} is collecting`}</>}
          </div>
        </div>
        <Pot level={refunded ? 0 : level} size={230} face={refunded ? "calm" : pot.status === "reached" ? "stars" : "idle"} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 88, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>{m(pot.raised)}</span>
          <span style={{ fontSize: 38, fontWeight: 600, color: C.muted }}>{`of ${m(pot.goal)}`}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div style={{ display: "flex" }}>
            {faces.map((p, i) => (
              <div key={p.address} style={{ display: "flex", width: 54, height: 54, marginLeft: i ? -12 : 0, borderRadius: 99, background: C.ink, color: C.paper, border: `3px solid ${C.paper}`, alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>{p.name[0]}</div>
            ))}
            {people.length > faces.length && (
              <div style={{ display: "flex", width: 54, height: 54, marginLeft: -12, borderRadius: 99, background: C.gold, color: C.ink, border: `3px solid ${C.paper}`, alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>{`+${people.length - faces.length}`}</div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: C.muted }}>
            {refunded ? `${pot.people.length} ${pot.people.length === 1 ? "was" : "were"} in` : `${people.length} in · back to you if it misses`}
          </div>
        </div>
      </div>
    </Frame>,
    { ...size, fonts },
  );
}
