import type { ReactNode } from "react";

/**
 * pottle's whatsapp stickers: the mascot with a white die-cut outline (so it reads on light and dark
 * chats), a short caption, and one small extra per sticker. rendered at 512x512 on transparent, the
 * size whatsapp wants, by the same image engine as the link previews so the real font is used
 */

const INK = "#231A33", GOLD = "#F2B32A", PINK = "#E0487A", RIBBON = "#C42A5C", MINT = "#1F7A57", WHITE = "#FFFFFF";

type Face = "idle" | "happy" | "stars" | "calm" | "worried" | "confused" | "wide" | "wink" | "up";
type Extra = "coin" | "sparkles" | "hearts" | "question" | "clock" | "none";
export type Sticker = { id: string; caption: string; face: Face; level: number; tilt?: number; extra?: Extra; color?: string };

export const STICKERS: Sticker[] = [
  { id: "chip-in", caption: "chip in?", face: "up", level: 0.1, extra: "coin" },
  { id: "im-in", caption: "i'm in!", face: "happy", level: 0.55, tilt: -6, extra: "coin", color: RIBBON },
  { id: "whos-in", caption: "who's in?", face: "idle", level: 0.3, tilt: 4 },
  { id: "goal-hit", caption: "goal hit!", face: "stars", level: 1, extra: "sparkles", color: MINT },
  { id: "thank-you", caption: "thank you!", face: "happy", level: 0.9, tilt: 5, extra: "hearts", color: RIBBON },
  { id: "tick-tock", caption: "tick tock", face: "worried", level: 0.35, extra: "clock" },
  { id: "got-it-back", caption: "got it back", face: "calm", level: 0 },
  { id: "hmm", caption: "hmm?", face: "confused", level: 0.4, tilt: -8, extra: "question" },
  { id: "so-close", caption: "so close!", face: "wide", level: 0.85 },
  { id: "pottle", caption: "pottle", face: "wink", level: 0.6, tilt: 3, color: RIBBON },
];

function eyes(face: Face) {
  const ink = INK;
  const one = (x: number, side: -1 | 1): ReactNode => {
    switch (face) {
      case "happy": return <path key={x} d={`M${x - 3.4} 50.4 Q${x} 45.6 ${x + 3.4} 50.4`} fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />;
      case "calm": return <path key={x} d={`M${x - 3.2} 48.4 Q${x} 51.8 ${x + 3.2} 48.4`} fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />;
      case "stars": return <path key={x} d={`M${x} 44.8 ${x + 1.3} 47.7 ${x + 4.2} 49 ${x + 1.3} 50.3 ${x} 53.2 ${x - 1.3} 50.3 ${x - 4.2} 49 ${x - 1.3} 47.7Z`} fill={ink} />;
      case "worried": return <g key={x}><circle cx={x} cy="49.5" r="2.5" fill={ink} /><path d={side < 0 ? `M${x - 3.6} 44.8 ${x + 2.4} 42.8` : `M${x - 2.4} 42.8 ${x + 3.6} 44.8`} stroke={ink} strokeWidth="1.9" strokeLinecap="round" /></g>;
      case "confused": return <circle key={x} cx={x} cy="49" r={side < 0 ? 3.7 : 2.2} fill={ink} />;
      case "wide": return <g key={x}><circle cx={x} cy="49" r="4.1" fill={ink} /><circle cx={x + 1.3} cy="47.6" r="1.3" fill={WHITE} /></g>;
      case "wink": return side < 0
        ? <path key={x} d={`M${x - 3.4} 50.4 Q${x} 45.6 ${x + 3.4} 50.4`} fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
        : <g key={x}><circle cx={x} cy="49" r="3.3" fill={ink} /><circle cx={x + 1} cy="47.9" r="1" fill={WHITE} /></g>;
      case "up": return <g key={x}><circle cx={x} cy="46.6" r="3.3" fill={ink} /><circle cx={x + 1} cy="45.5" r="1" fill={WHITE} /></g>;
      default: return <g key={x}><circle cx={x} cy="49" r="3.3" fill={ink} /><circle cx={x + 1} cy="47.9" r="1" fill={WHITE} /></g>;
    }
  };
  return [one(40, -1), one(56, 1)];
}

/** the extra, above or beside the pot, each with its own white outline */
function extra(kind: Extra) {
  const outlined = (el: ReactNode, outline: ReactNode) => <g>{outline}{el}</g>;
  switch (kind) {
    case "coin": return outlined(
      <g><circle cx="78" cy="10" r="8" fill={GOLD} stroke={INK} strokeWidth="2.4" /><path d="M78 6v8" stroke={INK} strokeWidth="2" strokeLinecap="round" /></g>,
      <circle cx="78" cy="10" r="12" fill={WHITE} />);
    case "sparkles": return <g>
      {[[14, 16, 1], [82, 12, 1.2], [88, 40, 0.8]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M0 -8 2.4 -2.4 8 0 2.4 2.4 0 8 -2.4 2.4 -8 0 -2.4 -2.4Z" fill={WHITE} stroke={WHITE} strokeWidth="5" strokeLinejoin="round" />
          <path d="M0 -8 2.4 -2.4 8 0 2.4 2.4 0 8 -2.4 2.4 -8 0 -2.4 -2.4Z" fill={GOLD} />
        </g>
      ))}</g>;
    case "hearts": return <g>
      {[[12, 20, 0.9, -12], [82, 12, 1.1, 10]].map(([x, y, s, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`}>
          <path d="M0 6s-7-4.4-9-8.4C-10.6-5.8-8.6-9-5.4-9-3.4-9-1.9-7.9 0-5.9 1.9-7.9 3.4-9 5.4-9 8.6-9 10.6-5.8 9-2.4 7 1.6 0 6 0 6z" fill={WHITE} stroke={WHITE} strokeWidth="5" strokeLinejoin="round" />
          <path d="M0 6s-7-4.4-9-8.4C-10.6-5.8-8.6-9-5.4-9-3.4-9-1.9-7.9 0-5.9 1.9-7.9 3.4-9 5.4-9 8.6-9 10.6-5.8 9-2.4 7 1.6 0 6 0 6z" fill={PINK} />
        </g>
      ))}</g>;
    case "question": return outlined(
      // drawn as a shape: the image engine cannot render text inside an svg
      <g fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round"><path d="M77.5 6.5 Q77.5 2.5 82 2.5 Q86.5 2.5 86.5 6.5 Q86.5 9 83.5 10.4 Q82 11.2 82 13.4" /><circle cx="82" cy="18" r=".6" fill={INK} /></g>,
      <circle cx="82" cy="10" r="12" fill={WHITE} />);
    case "clock": return outlined(
      <g><circle cx="80" cy="12" r="9" fill={WHITE} stroke={INK} strokeWidth="2.6" /><path d="M80 7v5l3.5 2.4" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" /></g>,
      <circle cx="80" cy="12" r="13" fill={WHITE} />);
    default: return null;
  }
}

/** the mascot, drawn twice: a fat white silhouette for the die-cut outline, then pottle on top */
function Mascot({ s }: { s: Sticker }) {
  const l = Math.max(0, Math.min(1, s.level));
  const shown = l === 0 ? 0 : Math.max(0.08, l);
  const top = 80 - shown * 46;
  return (
    <svg width="380" height="380" viewBox="-6 -8 108 116" style={{ transform: `rotate(${s.tilt ?? 0}deg)` }}>
      <defs><clipPath id="in"><circle cx="48" cy="57" r="23" /></clipPath></defs>
      {/* die-cut outline */}
      <g fill={WHITE} stroke={WHITE} strokeWidth="12" strokeLinejoin="round">
        <rect x="17" y="17" width="62" height="12" rx="6" />
        <circle cx="48" cy="57" r="27" />
        <rect x="31" y="86" width="12" height="10" rx="5" /><rect x="53" y="86" width="12" height="10" rx="5" />
      </g>
      {/* pottle */}
      <rect x="31" y="86" width="12" height="10" rx="5" fill={INK} /><rect x="53" y="86" width="12" height="10" rx="5" fill={INK} />
      <circle cx="48" cy="57" r="27" fill={WHITE} />
      {shown > 0 && <rect x="20" y={top} width="56" height={82 - top} fill={GOLD} clipPath="url(#in)" />}
      <circle cx="48" cy="57" r="27" fill="none" stroke={INK} strokeWidth="8" />
      <rect x="17" y="17" width="62" height="12" rx="6" fill={INK} />
      <ellipse cx="33" cy="60" rx="3.6" ry="2.2" fill={PINK} fillOpacity=".55" /><ellipse cx="63" cy="60" rx="3.6" ry="2.2" fill={PINK} fillOpacity=".55" />
      {eyes(s.face)}
      {extra(s.extra ?? "none")}
    </svg>
  );
}

/** the whole sticker: mascot on top, the caption on a white label that joins its outline, one die-cut shape */
export function StickerArt({ s }: { s: Sticker }) {
  const long = s.caption.length > 9;
  return (
    <div style={{ width: 512, height: 512, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", fontFamily: "Bricolage", paddingBottom: 22 }}>
      <Mascot s={s} />
      <div style={{ display: "flex", marginTop: -22, background: WHITE, borderRadius: 999, padding: long ? "8px 26px 14px" : "6px 30px 14px", fontSize: long ? 54 : 66, fontWeight: 800, letterSpacing: long ? -2 : -2.6, color: s.color ?? INK, lineHeight: 1 }}>{s.caption}</div>
    </div>
  );
}
