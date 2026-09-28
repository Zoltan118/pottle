import type { ReactNode } from "react";
import type { Wrap } from "./pot";
import { ogFont } from "./ogfont";

/**
 * the building blocks of pottle's link previews (1200x630): the pot's own wrap as the background, a
 * paper card like the pot page, the wordmark, and the pot mark filled to the real amount. one visual
 * language with the site, drawn in svg so nothing depends on css the image renderer does not have
 */

export const OG = { width: 1200, height: 630 };
export const C = { ink: "#231A33", paper: "#F6F3FA", muted: "#5E5470", ribbon: "#C42A5C", ribbonText: "#B0204F", gold: "#F2B32A", mint: "#1F7A57", line: "#E3DCEC" };

/** each wrap's repeating tile, the same shapes and colours as the site's css patterns */
const TILES: Record<Wrap, { w: number; h: number; body: string } | null> = {
  plain: null,
  confetti: { w: 192, h: 156, body:
    `<circle cx="38" cy="47" r="6" fill="${C.gold}"/><circle cx="134" cy="19" r="6" fill="${C.gold}"/><circle cx="102" cy="113" r="6" fill="${C.gold}"/>` +
    `<circle cx="73" cy="109" r="5" fill="${C.ribbon}"/><circle cx="165" cy="72" r="5" fill="${C.ribbon}"/><circle cx="18" cy="128" r="5" fill="${C.ribbon}"/>` +
    `<circle cx="122" cy="61" r="4" fill="${C.mint}"/><circle cx="60" cy="16" r="4" fill="${C.mint}"/><circle cx="178" cy="140" r="4" fill="${C.mint}"/>` },
  stripes: { w: 62, h: 62, body: `<path d="M-16 16 L16 -16 M-16 78 L78 -16 M46 78 L78 46" stroke="${C.ribbon}" stroke-opacity=".26" stroke-width="22"/>` },
  gingham: { w: 40, h: 40, body: `<rect width="20" height="40" fill="${C.gold}" fill-opacity=".32"/><rect width="40" height="20" fill="${C.gold}" fill-opacity=".32"/>` },
  hearts: { w: 64, h: 64, body:
    `<path d="M12 20.5s-7.2-4.5-9.3-8.6C1 8.4 3 5 6.5 5c2 0 3.5 1.1 5.5 3.2C14 6.1 15.5 5 17.5 5 21 5 23 8.4 21.3 11.9 19.2 16 12 20.5 12 20.5z" fill="#E0487A" fill-opacity=".55" transform="translate(4 4) scale(.8)"/>` +
    `<path d="M12 20.5s-7.2-4.5-9.3-8.6C1 8.4 3 5 6.5 5c2 0 3.5 1.1 5.5 3.2C14 6.1 15.5 5 17.5 5 21 5 23 8.4 21.3 11.9 19.2 16 12 20.5 12 20.5z" fill="#E0487A" fill-opacity=".4" transform="translate(36 34) scale(.95)"/>` },
  stars: { w: 72, h: 72, body:
    `<path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="${C.gold}" fill-opacity=".85" transform="translate(6 8) scale(.9)"/>` +
    `<path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="${C.gold}" fill-opacity=".6" transform="translate(46 44) scale(.55)"/><circle cx="54" cy="16" r="2.5" fill="${C.gold}" fill-opacity=".55"/>` },
  waves: { w: 80, h: 32, body: `<path d="M0 16 Q20 4 40 16 T80 16" fill="none" stroke="#3FA37E" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>` },
  sprinkles: { w: 72, h: 72, body:
    `<g stroke-width="5" stroke-linecap="round" stroke-opacity=".75"><path d="M10 14l10 -5" stroke="${C.gold}"/><path d="M44 10l7 9" stroke="#E0487A"/><path d="M58 40l-10 4" stroke="#3FA37E"/>` +
    `<path d="M20 50l4 10" stroke="#9A7BD1"/><path d="M36 34l9 -3" stroke="#E0487A"/><path d="M6 36l3 -8" stroke="#3FA37E"/><path d="M52 60l9 3" stroke="${C.gold}"/></g>` },
};

/** the wrap tiled across the whole image, as one svg picture */
function wrapUri(wrap: Wrap) {
  const t = TILES[wrap];
  const body = t
    ? `<defs><pattern id="w" width="${t.w}" height="${t.h}" patternUnits="userSpaceOnUse">${t.body}</pattern></defs><rect width="100%" height="100%" fill="${C.paper}"/><rect width="100%" height="100%" fill="url(#w)"/>`
    : `<rect width="100%" height="100%" fill="${C.paper}"/>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}">${body}</svg>`)}`;
}

type Face = "idle" | "happy" | "stars" | "calm";

/** the pot at a fill level (0 to 1). with a `face` it is pottle the mascot: eyes, blush and feet */
export function Pot({ level, size, color = C.ink, face }: { level: number; size: number; color?: string; face?: Face }) {
  const l = Math.max(0, Math.min(1, level));
  const shown = l === 0 ? 0 : Math.max(0.08, l); // a sliver is always visible once anyone is in
  const top = 80 - shown * 46; // the fill rises inside the round body (y 34 to 80)
  const eye = (x: number) => {
    const ink = face === "stars" ? C.ink : color;
    if (face === "happy") return <path d={`M${x - 3.4} 50.4 Q${x} 45.6 ${x + 3.4} 50.4`} fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />;
    if (face === "calm") return <path d={`M${x - 3.2} 48.4 Q${x} 51.8 ${x + 3.2} 48.4`} fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />;
    if (face === "stars") return <path d={`M${x} 44.8 ${x + 1.3} 47.7 ${x + 4.2} 49 ${x + 1.3} 50.3 ${x} 53.2 ${x - 1.3} 50.3 ${x - 4.2} 49 ${x - 1.3} 47.7Z`} fill={ink} />;
    return <circle cx={x} cy="49" r="3.2" fill={ink} />;
  };
  return (
    <svg width={size} height={face ? size * 108 / 96 : size} viewBox={`0 0 96 ${face ? 108 : 96}`}>
      <defs><clipPath id="inner"><circle cx="48" cy="57" r="23" /></clipPath></defs>
      {face && <g><rect x="31" y="86" width="12" height="10" rx="5" fill={color} /><rect x="53" y="86" width="12" height="10" rx="5" fill={color} /></g>}
      <rect x="17" y="17" width="62" height="12" rx="6" fill={color} />
      {shown > 0 && <rect x="20" y={top} width="56" height={82 - top} fill={C.gold} clipPath="url(#inner)" />}
      <circle cx="48" cy="57" r="27" fill="none" stroke={color} strokeWidth="8" />
      {face && <g><ellipse cx="33" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" /><ellipse cx="63" cy="60" rx="3.6" ry="2.2" fill="#E0487A" fillOpacity=".5" />{eye(40)}{eye(56)}</g>}
    </svg>
  );
}

/** "pottle", with the pot mark as the o, exactly like the site's logo */
export function Wordmark({ size = 44 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: size, fontWeight: 800, letterSpacing: -size * 0.045, color: C.ink, lineHeight: 1 }}>
      <span>p</span>
      <div style={{ display: "flex", marginTop: size * 0.1, marginLeft: -size * 0.04, marginRight: -size * 0.03 }}><Pot level={0.7} size={size * 0.78} /></div>
      <span>ttle</span>
    </div>
  );
}

/** the pot's wrap all around, a paper card in the middle: the same frame as the pot page */
export function Frame({ wrap, children }: { wrap: Wrap; children: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Bricolage", color: C.ink }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wrapUri(wrap)} width={OG.width} height={OG.height} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
      <div style={{ position: "absolute", top: 36, left: 36, right: 36, bottom: 36, display: "flex", flexDirection: "column", background: C.paper, borderRadius: 44, border: `4px solid ${C.ink}`, padding: "44px 56px" }}>
        {children}
      </div>
    </div>
  );
}

/** a small solid label, top right of the card */
export function Pill({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "ok" | "back" }) {
  const bg = tone === "ok" ? C.mint : tone === "back" ? C.ribbon : C.ink;
  return <div style={{ display: "flex", background: bg, color: C.paper, fontSize: 28, fontWeight: 800, padding: "10px 24px", borderRadius: 999 }}>{children}</div>;
}

/** title size by length, so a long title wraps to two lines at most instead of spilling */
export const titleSize = (t: string) => (t.length <= 12 ? 104 : t.length <= 20 ? 84 : t.length <= 32 ? 68 : 56);

export async function ogFonts() {
  const [bold, semi] = await Promise.all([ogFont(800), ogFont(600)]);
  return [
    ...(bold ? [{ name: "Bricolage", data: bold, weight: 800 as const, style: "normal" as const }] : []),
    ...(semi ? [{ name: "Bricolage", data: semi, weight: 600 as const, style: "normal" as const }] : []),
  ];
}
