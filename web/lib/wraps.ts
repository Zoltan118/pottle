/*
 * the wraps that fit what a pot is for. a trip, a dinner or a birthday each get their own patterns, and
 * the wrap step shows the ones that fit the title first, every other wrap one tap away.
 *
 * each new pattern is drawn once here, as an svg tile, and used twice: as the site's css background
 * (wrapCss, injected by the root layout) and as the link preview's background (lib/ogart.tsx). the
 * eight original wraps keep their hand-written css in globals.css. colours are fixed hues at partial
 * opacity on the page's paper, so every tile reads in light and dark
 */

import type { Wrap } from "./pot";

const gold = "#F2B32A", pink = "#E0487A", mint = "#3FA37E", violet = "#9A7BD1", ribbon = "#C42A5C";

export type Tile = { w: number; h: number; body: string };

// a small plane, lucide's shape
const plane = "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";
const glass = (x: number, tilt: number, c: string) =>
  `<g transform="translate(${x} 6) rotate(${tilt} 9 20)" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".7">` +
  `<path d="M2 2h14l-1 8a6 6 0 0 1-12 0z"/><path d="M9 16v10M4 26h10"/></g>`;
const balloon = (x: number, y: number, c: string) =>
  `<ellipse cx="${x}" cy="${y}" rx="9" ry="11" fill="${c}" fill-opacity=".6"/><path d="M${x} ${y + 11} l-2 3 h4z" fill="${c}" fill-opacity=".6"/>` +
  `<path d="M${x} ${y + 14} q-4 7 1 14" fill="none" stroke="${c}" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>`;
const candle = (x: number, y: number, c: string) =>
  `<rect x="${x}" y="${y}" width="7" height="20" rx="2" fill="${c}" fill-opacity=".55"/>` +
  `<path d="M${x + 3.5} ${y - 11} c3 4 3 7 0 8 c-3 -1 -3 -4 0 -8z" fill="${gold}" fill-opacity=".85"/>`;

const DRAWN = {
  // trip
  boarding: { w: 104, h: 72, body:
    `<path d="${plane}" fill="none" stroke="${mint}" stroke-opacity=".6" stroke-width="2" stroke-linejoin="round" transform="translate(14 8) scale(1.3)"/>` +
    `<path d="M0 58 H104" stroke="${gold}" stroke-opacity=".7" stroke-width="3.5" stroke-dasharray="10 9" stroke-linecap="round"/>` },
  sunset: { w: 96, h: 80, body:
    `<path d="M24 52 a24 24 0 0 1 48 0z" fill="${gold}" fill-opacity=".5"/>` +
    `<path d="M10 58 H86 M22 66 H74 M34 74 H62" stroke="${pink}" stroke-opacity=".5" stroke-width="3.5" stroke-linecap="round"/>` },
  palms: { w: 88, h: 88, body:
    `<g fill="none" stroke="${mint}" stroke-opacity=".55" stroke-width="3.2" stroke-linecap="round">` +
    `<path d="M30 78 q4 -24 0 -46"/><path d="M30 32 q-14 -8 -24 2 M30 32 q14 -8 24 2 M30 32 q-6 -14 -18 -16 M30 32 q6 -14 18 -16"/></g>` +
    `<circle cx="70" cy="66" r="4" fill="${gold}" fill-opacity=".6"/>` },
  // dinner
  cheers: { w: 96, h: 72, body: glass(26, -14, ribbon) + glass(48, 14, ribbon) +
    `<path d="M47 4 l-3 -3 M52 3 v-3 M57 4 l3 -3" stroke="${gold}" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>` },
  lemons: { w: 84, h: 84, body:
    `<g transform="translate(24 24)"><circle r="15" fill="${gold}" fill-opacity=".45"/><circle r="11" fill="none" stroke="${gold}" stroke-opacity=".7" stroke-width="1.6"/>` +
    `<path d="M0 -11 V11 M-11 0 H11 M-8 -8 L8 8 M-8 8 L8 -8" stroke="${gold}" stroke-opacity=".7" stroke-width="1.4"/></g>` +
    `<path d="M62 62 q8 -10 14 -2 q-6 10 -14 2z" fill="${mint}" fill-opacity=".45"/>` },
  forks: { w: 80, h: 80, body:
    `<g fill="none" stroke="${violet}" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M18 10 v14 a5 5 0 0 0 10 0 v-14 M23 10 v14 M23 29 v38"/>` +
    `<path d="M48 67 V10 c8 4 10 14 8 26 h-8"/></g>` },
  // birthday
  balloons: { w: 96, h: 96, body: balloon(22, 22, pink) + balloon(70, 36, gold) + balloon(40, 66, violet) },
  candles: { w: 88, h: 76, body: candle(14, 40, pink) + candle(40, 32, violet) + candle(66, 44, mint) },
} satisfies Record<string, Tile>;

export type NewWrap = keyof typeof DRAWN;

/** every themed tile with the same calm: more room around each shape, and softer, so a whole page
 * of it sits behind text the way the original wraps do */
export const NEW_TILES = Object.fromEntries(
  (Object.entries(DRAWN) as [NewWrap, Tile][]).map(([id, t]) => [id, {
    w: Math.round(t.w * 1.45), h: Math.round(t.h * 1.45),
    body: `<g opacity=".72" transform="translate(${Math.round(t.w * .22)} ${Math.round(t.h * .22)})">${t.body}</g>`,
  }]),
) as Record<NewWrap, Tile>;

/** a tile as a css background image */
export const tileUri = (t: Tile) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${t.w}" height="${t.h}">${t.body}</svg>`)}")`;

/** the css for the new wraps, the same shape of rule as the originals in globals.css */
export const wrapCss = (Object.entries(NEW_TILES) as [NewWrap, Tile][])
  .map(([id, t]) => `.w-${id}{background-color:var(--paper);background-image:${tileUri(t)};background-size:${t.w}px ${t.h}px}` +
    // the small square in the wrap picker shows one whole motif, centred, rather than a crop of the tiling
    `.wrapchoice.w-${id}{background-position:center;background-size:${Math.round(t.w * .62)}px ${Math.round(t.h * .62)}px}`)
  .join("");

/*
 * what a pot is for, read from its title. whole words only, so "tripod" or "dinnerware" aren't trips
 * or dinners. the quick picks on the first step (trip, dinner, birthday) all land here
 */
export type Theme = "trip" | "dinner" | "birthday";
const WORDS: Record<Theme, string[]> = {
  trip: ["trip", "trips", "travel", "holiday", "holidays", "vacation", "flight", "flights", "weekend", "getaway", "ski", "skiing", "beach", "camping", "hotel", "airbnb", "road trip", "festival"],
  dinner: ["dinner", "dinners", "lunch", "brunch", "breakfast", "drinks", "drink", "pizza", "bbq", "barbecue", "restaurant", "meal", "sushi", "wine", "beer", "takeaway", "supper"],
  birthday: ["birthday", "bday", "b-day", "party", "cake", "anniversary"],
};
// "her 30th", "turns 40th"... or "30th birthday": a number with an ordinal ending next to a word that makes
// it about a person, so "2nd hand bike" or "10th floor coffee" don't count
const ORDINAL = /\b(her|his|my|their|your|turns|turning)\s+\d{1,3}(st|nd|rd|th)\b|\b\d{1,3}(st|nd|rd|th)\s+(birthday|bday|party|anniversary)\b/;

export function themeOf(title: string): Theme | null {
  const t = ` ${title.toLowerCase()} `;
  for (const theme of Object.keys(WORDS) as Theme[]) {
    if (WORDS[theme].some((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[-]/g, "\\-")}([^a-z0-9]|$)`).test(t))) return theme;
  }
  return ORDINAL.test(t) ? "birthday" : null;
}

/** the wraps a theme shows first: its own, then the originals that fit it */
export const THEME_WRAPS: Record<Theme, Wrap[]> = {
  trip: ["boarding", "sunset", "palms", "waves"],
  dinner: ["cheers", "lemons", "forks", "gingham"],
  birthday: ["balloons", "candles", "sprinkles", "confetti"],
};
