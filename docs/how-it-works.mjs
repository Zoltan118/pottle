// draws docs/how-it-works-light.svg and docs/how-it-works-dark.svg: the readme's animated "how it works".
// plain svg with css keyframes, so github plays it inside an <img> with no script. one 16 second loop:
// a pot is made, the link goes to the group, three friends chip in through the fee relayer, the goal is
// hit and it pays the organiser; then a second pot misses its deadline and everyone is refunded.
// run: node docs/how-it-works.mjs
import { writeFileSync } from "node:fs";

const W = 960, H = 470, T = 16; // canvas, loop length in seconds
const THEMES = {
  light: { paper: "#F6F3FA", surface: "#FFFFFF", ink: "#231A33", muted: "#5E5470", line: "#E3DCEC", ribbon: "#C42A5C", gold: "#F2B32A", mint: "#1F7A57" },
  dark: { paper: "#15101E", surface: "#201930", ink: "#F1ECF7", muted: "#B3A9C4", line: "#342A45", ribbon: "#FF6A96", gold: "#F2B32A", mint: "#5FD3A4" },
};
const FONT = "ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

// where things sit
const ORG = { x: 150, y: 225 };
const POT = { x: 480, y: 215 };
const FEE = { x: 650, y: 225 };
const FRIENDS = [{ x: 800, y: 150, n: "ana" }, { x: 800, y: 225, n: "ben" }, { x: 800, y: 300, n: "cy" }];

const pct = (t) => `${((t / T) * 100).toFixed(3)}%`;
let uid = 0;
const css = [];

/**
 * one animated element: a list of [time, {props}] stops. a stop holds until the next; `move: true` on a
 * stop eases into it from the previous one, otherwise it switches instantly
 */
function anim(stops) {
  const name = `a${uid++}`;
  const frames = [];
  stops.forEach(([t, p], i) => {
    const prev = stops[i - 1];
    if (prev && !p.move) frames.push(`${pct(Math.max(0, t - 0.01))}{${props(prev[1])}}`);
    frames.push(`${pct(t)}{${props(p)}}`);
  });
  const last = stops[stops.length - 1][1];
  frames.push(`100%{${props(last)}}`);
  css.push(`@keyframes ${name}{${frames.join("")}}.${name}{animation:${name} ${T}s cubic-bezier(.45,0,.25,1) infinite}`);
  return name;
}
function props(p) {
  const out = [];
  if (p.o !== undefined) out.push(`opacity:${p.o}`);
  if (p.x !== undefined || p.y !== undefined || p.s !== undefined) out.push(`transform:translate(${p.x ?? 0}px,${p.y ?? 0}px) scale(${p.s ?? 1})`);
  return out.join(";");
}

const text = (x, y, s, { size = 15, weight = 600, fill = "var(--muted)", anchor = "middle", cls = "" } = {}) =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`;

// a person: a circle with an initial, and the name under it
const person = (x, y, n, ring, side = false) =>
  `<circle cx="${x}" cy="${y}" r="22" fill="var(--surface)" stroke="${ring}" stroke-width="2.5"/>` +
  text(x, y + 6, n[0], { size: 17, weight: 800, fill: "var(--ink)" }) +
  (side ? text(x + 32, y + 5, n, { size: 14, weight: 700, fill: "var(--ink)", anchor: "start" }) : text(x, y + 44, n, { size: 14, weight: 700, fill: "var(--ink)" }));

// a coin, drawn at the origin and moved by its animation
const coin = (cls, label) =>
  `<g class="${cls}" opacity="0"><circle r="15" fill="var(--gold)" stroke="var(--ink)" stroke-width="2"/>${label ? text(0, 5, label, { size: 11, weight: 800, fill: "#231A33" }) : ""}</g>`;

function build() {
  const parts = [];

  // header: the pottle mark and a title
  parts.push(`<g transform="translate(36,26) scale(.42)"><rect x="17" y="17" width="62" height="12" rx="6" fill="var(--ink)"/><clipPath id="hm"><circle cx="48" cy="57" r="23"/></clipPath><rect x="20" y="58" width="56" height="30" fill="var(--gold)" clip-path="url(#hm)"/><circle cx="48" cy="57" r="27" fill="none" stroke="var(--ink)" stroke-width="8"/></g>`);
  parts.push(text(84, 58, "how pottle works", { size: 22, weight: 800, fill: "var(--ink)", anchor: "start" }));

  // lane titles
  parts.push(text(ORG.x, 112, "organiser", { size: 13, weight: 700 }));
  parts.push(text(POT.x, 112, "the pot: a contract on arc", { size: 13, weight: 700 }));
  parts.push(text(FRIENDS[0].x, 112, "friends", { size: 13, weight: 700 }));

  // people
  parts.push(person(ORG.x, ORG.y, "maya", "var(--ribbon)"));
  FRIENDS.forEach((f) => parts.push(person(f.x, f.y, f.n, "var(--line)", true)));

  // the fee relayer, between the friends and the pot
  parts.push(`<rect x="${FEE.x - 62}" y="${FEE.y - 17}" width="124" height="34" rx="17" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>`);
  parts.push(text(FEE.x, FEE.y + 5, "pottle pays the fee", { size: 12, weight: 700, fill: "var(--ink)" }));

  // the pot: the pottle mark, big, filling with gold. no owner, so nothing but the rules can move it
  const fill = anim([
    [0, { y: 84 }], [5.2, { y: 60 }], [6.2, { y: 28 }], [7.2, { y: 0 }],
    [8.6, { y: 0 }], [9.4, { y: 84, move: true }],
    [12.5, { y: 60 }], [12.9, { y: 26 }],
    [13.8, { y: 26 }], [14.6, { y: 84, move: true }],
  ]);
  parts.push(`<g transform="translate(${POT.x - 80},${POT.y - 92}) scale(1.67)"><clipPath id="pm"><circle cx="48" cy="57" r="23"/></clipPath>` +
    `<rect x="17" y="17" width="62" height="12" rx="6" fill="var(--ink)"/>` +
    `<g clip-path="url(#pm)"><rect class="${fill}" x="20" y="34" width="56" height="56" fill="var(--gold)"/></g>` +
    `<circle cx="48" cy="57" r="27" fill="none" stroke="var(--ink)" stroke-width="7"/></g>`);

  // the total under the pot: one label per state, each shown only while it is true
  const totals = [
    [0, 5.2, "$0 of $200"], [5.2, 6.2, "$60 of $200"], [6.2, 7.2, "$140 of $200"], [7.2, 9.4, "$200 of $200"],
    [9.4, 11.6, "paid out"], [11.6, 12.5, "$0 of $200"], [12.5, 12.9, "$60 of $200"], [12.9, 14.6, "$140 of $200"], [14.6, T, "refunded"],
  ];
  totals.forEach(([a, b, s]) => {
    const c = anim(a === 0 ? [[0, { o: 1 }], [b, { o: 0 }]] : [[0, { o: 0 }], [a, { o: 1 }], [b, { o: 0 }]]);
    parts.push(`<g class="${c}">${text(POT.x, POT.y + 100, s, { size: 18, weight: 800, fill: "var(--ink)" })}</g>`);
  });

  // tags on the pot: goal hit, then deadline passed
  const tag = (s, color, a, b) => {
    const c = anim([[0, { o: 0, y: 6 }], [a - 0.35, { o: 0, y: 6 }], [a, { o: 1, y: 0, move: true }], [b, { o: 1, y: 0 }], [b + 0.3, { o: 0, y: 0, move: true }]]);
    const w = s.length * 8 + 26;
    return `<g class="${c}"><rect x="${POT.x - w / 2}" y="${POT.y + 116}" width="${w}" height="28" rx="14" fill="${color}"/>${text(POT.x, POT.y + 135, s, { size: 13, weight: 800, fill: "var(--paper)" })}</g>`;
  };
  parts.push(tag("goal hit", "var(--mint)", 7.4, 10.4));
  parts.push(tag("deadline passed", "var(--ribbon)", 13.2, 15.6));

  // 1. the organiser makes the pot: a little burst at the pot
  const made = anim([[0, { o: 0, s: 0.6 }], [0.5, { o: 0.9, s: 0.6 }], [1.4, { o: 0, s: 1.5, move: true }]]);
  parts.push(`<g transform="translate(${POT.x},${POT.y - 10})"><circle class="${made}" r="80" fill="none" stroke="var(--ribbon)" stroke-width="3" style="transform-box:fill-box;transform-origin:center"/></g>`);
  const create = anim([[0, { o: 0, x: ORG.x, y: ORG.y - 40 }], [0.3, { o: 1, x: ORG.x, y: ORG.y - 40 }], [1.2, { o: 1, x: POT.x - 90, y: POT.y - 40, move: true }], [1.5, { o: 0, x: POT.x - 90, y: POT.y - 40 }]]);
  parts.push(`<g class="${create}"><rect x="-44" y="-14" width="88" height="28" rx="14" fill="var(--ribbon)"/>${text(0, 5, "create", { size: 13, weight: 800, fill: "var(--paper)" })}</g>`);

  // 2. the link goes to the group
  const link = anim([[0, { o: 0, x: ORG.x, y: ORG.y + 70 }], [2.0, { o: 1, x: ORG.x, y: ORG.y + 70 }], [3.4, { o: 1, x: FRIENDS[1].x - 90, y: ORG.y + 70, move: true }], [3.9, { o: 0, x: FRIENDS[1].x - 90, y: ORG.y + 70 }]]);
  parts.push(`<g class="${link}"><rect x="-70" y="-15" width="140" height="30" rx="15" fill="var(--surface)" stroke="var(--ribbon)" stroke-width="2"/>${text(0, 5, "pottle.xyz/p/12-…", { size: 12, weight: 700, fill: "var(--ink)" })}</g>`);

  // 3. three friends chip in, each through the fee relayer into the pot
  const amounts = ["$60", "$80", "$60"];
  FRIENDS.forEach((f, i) => {
    const t0 = 4.2 + i;
    const c = anim([[0, { o: 0, x: f.x, y: f.y }], [t0, { o: 1, x: f.x, y: f.y }], [t0 + 0.45, { o: 1, x: FEE.x, y: FEE.y, move: true }], [t0 + 0.95, { o: 1, x: POT.x + 20, y: POT.y - 4, move: true }], [t0 + 1.05, { o: 0, x: POT.x + 20, y: POT.y - 4 }]]);
    parts.push(coin(c, amounts[i]));
  });

  // goal hit: the whole pot goes to the organiser
  const out = anim([[0, { o: 0, x: POT.x, y: POT.y, s: 1.4 }], [8.6, { o: 1, x: POT.x, y: POT.y, s: 1.4 }], [9.7, { o: 1, x: ORG.x + 40, y: ORG.y, s: 1.4, move: true }], [9.9, { o: 0, x: ORG.x + 40, y: ORG.y, s: 1.4 }]]);
  parts.push(coin(out, "$200"));
  const got = anim([[0, { o: 0 }], [9.8, { o: 1 }], [11.4, { o: 1 }], [11.7, { o: 0, move: true }]]);
  parts.push(`<g class="${got}">${text(ORG.x, ORG.y - 38, "+$200", { size: 16, weight: 800, fill: "var(--mint)" })}</g>`);

  // a second pot that misses: ana and ben chip in, cy doesn't, the deadline passes, both are paid back
  [0, 1].forEach((i) => {
    const f = FRIENDS[i];
    const t0 = 11.7 + i * 0.4;
    const inC = anim([[0, { o: 0, x: f.x, y: f.y }], [t0, { o: 1, x: f.x, y: f.y }], [t0 + 0.4, { o: 1, x: FEE.x, y: FEE.y, move: true }], [t0 + 0.8, { o: 1, x: POT.x + 20, y: POT.y - 4, move: true }], [t0 + 0.88, { o: 0, x: POT.x + 20, y: POT.y - 4 }]]);
    parts.push(coin(inC, amounts[i]));
    const r0 = 13.7 + i * 0.25;
    const back = anim([[0, { o: 0, x: POT.x + 20, y: POT.y - 4 }], [r0, { o: 1, x: POT.x + 20, y: POT.y - 4 }], [r0 + 0.45, { o: 1, x: FEE.x, y: FEE.y - 62, move: true }], [r0 + 0.85, { o: 1, x: f.x - 40, y: f.y, move: true }], [r0 + 0.95, { o: 0, x: f.x - 40, y: f.y }]]);
    parts.push(coin(back, amounts[i]));
    const plus = anim([[0, { o: 0 }], [r0 + 0.9, { o: 1 }], [15.6, { o: 1 }], [15.9, { o: 0, move: true }]]);
    parts.push(`<g class="${plus}">${text(f.x + 74, f.y + 5, `+${amounts[i]}`, { size: 14, weight: 800, fill: "var(--mint)", anchor: "start" })}</g>`);
  });

  // the caption: what is happening, in words
  const caps = [
    [0, 2.0, "1. the organiser makes a pot: what it's for, a goal, a deadline"],
    [2.0, 4.0, "2. one link goes to the group chat"],
    [4.0, 7.6, "3. friends sign in with an email and sign once. pottle pays the network fee"],
    [7.6, 11.5, "goal hit: the contract pays the organiser. nobody could take it early"],
    [11.5, 13.2, "another pot: ana and ben chip in, cy doesn't"],
    [13.2, T, "deadline passed below the goal: everyone gets back exactly what they put in"],
  ];
  parts.push(`<rect x="40" y="${H - 72}" width="${W - 80}" height="44" rx="22" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>`);
  caps.forEach(([a, b, s]) => {
    const c = anim(a === 0 ? [[0, { o: 1 }], [b, { o: 0 }]] : [[0, { o: 0 }], [a, { o: 1 }], [b, { o: 0 }]]);
    parts.push(`<g class="${c}">${text(W / 2, H - 45, s, { size: 15, weight: 700, fill: "var(--ink)" })}</g>`);
  });

  return parts.join("\n");
}

for (const [name, t] of Object.entries(THEMES)) {
  uid = 0; css.length = 0;
  const body = build();
  const vars = Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(";");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="how pottle works: a pot is made, the link goes to the group, friends chip in and pottle pays the fee, then the pot pays the organiser when the goal is hit or refunds everyone if the deadline passes">
<style>svg{${vars}}${css.join("")}
@media (prefers-reduced-motion: reduce){*{animation-play-state:paused!important;animation-delay:-8.8s!important}}</style>
<rect width="${W}" height="${H}" rx="24" fill="var(--paper)"/>
${body}
</svg>
`;
  writeFileSync(new URL(`./how-it-works-${name}.svg`, import.meta.url), svg);
  console.log(`docs/how-it-works-${name}.svg ${(svg.length / 1024).toFixed(1)} kb`);
}
