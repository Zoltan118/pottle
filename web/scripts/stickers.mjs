// saves pottle's whatsapp sticker pack from the dev server: 512x512 webp (under 100KB each, what
// whatsapp asks for), png copies for iphone photos and sticker apps, a 96x96 tray icon, and a zip.
// run with the dev server up: node scripts/stickers.mjs
import sharp from "sharp";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const BASE = process.env.STICKER_BASE ?? "http://localhost:3000";
const IDS = ["chip-in", "im-in", "whos-in", "goal-hit", "thank-you", "tick-tock", "got-it-back", "hmm", "so-close", "pottle"];
const OUT = new URL("../public/stickers/", import.meta.url);
await mkdir(OUT, { recursive: true });

/*
 * the die-cut. an iphone's "add sticker" lifts only what it takes for the subject, and on the bare
 * art it kept the pot and dropped the caption and most of the white border (measured with apple's
 * own subject lifting on a mac: about half the sticker, a tenth of the caption). one solid shape
 * fixes that: the art is scaled in to leave room, the white is closed into a single silhouette so
 * the caption joins the pot, then a thin ink outline and a soft shadow make the white read as part
 * of the sticker rather than as background
 */
const SIZE = 512, SCALE = 0.86, CLOSE = 44, RING = 8, SHADOW = 10, DROP = 6;
const INK = [35, 26, 51];

// max (or min) over a disc-ish neighbourhood, one pixel ring at a time: alternating the 4 and 8
// neighbourhoods grows an octagon, close enough to round at these radii
function grow(a, r, fn = Math.max) {
  let cur = a;
  for (let i = 0; i < r; i++) {
    const next = new Uint8Array(cur.length), diag = i % 2 === 1;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      let v = cur[y * SIZE + x];
      for (const [dx, dy] of diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        v = fn(v, xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE ? (fn === Math.max ? 0 : 0) : cur[yy * SIZE + xx]);
      }
      next[y * SIZE + x] = v;
    }
    cur = next;
  }
  return cur;
}
const solid = (a) => a.map((v) => (v > 127 ? 255 : 0));
const layer = (mask, [r, g, b]) => {
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = mask[i]; }
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toBuffer();
};

async function dieCut(art) {
  const inner = Math.round(SIZE * SCALE), pad = Math.round((SIZE - inner) / 2);
  const placed = await sharp(art).resize(inner, inner).extend({ top: pad - DROP, bottom: SIZE - inner - pad + DROP, left: pad, right: SIZE - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data } = await sharp(placed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = solid(new Uint8Array(SIZE * SIZE).map((_, i) => data[i * 4 + 3]));
  const closed = grow(grow(alpha, CLOSE), CLOSE, Math.min).map((v, i) => Math.max(v, alpha[i]));
  const ring = grow(closed, RING);
  const shadowMask = await sharp(Buffer.from(ring.map((v) => Math.round(v * 0.32))), { raw: { width: SIZE, height: SIZE, channels: 1 } }).blur(SHADOW).extractChannel(0).raw().toBuffer(); // one channel in, one out
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await layer(shadowMask, INK), top: DROP, left: 0 },
      { input: await layer(ring, INK) },
      { input: await layer(closed, [255, 255, 255]) },
      { input: placed },
    ]).png().toBuffer();
}

for (const id of IDS) {
  let res;
  for (let tries = 0; ; tries++) { // the dev server sometimes drops a connection while compiling; try again
    try { res = await fetch(`${BASE}/dev/sticker/${id}`); if (res.ok) break; } catch (e) { if (tries > 3) throw e; }
    if (tries > 3) throw new Error(`sticker ${id}: ${res?.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const png = await dieCut(Buffer.from(await res.arrayBuffer()));
  await writeFile(new URL(`${id}.png`, OUT), png);
  let q = 90, webp;
  do { webp = await sharp(png).webp({ quality: q, alphaQuality: 90 }).toBuffer(); q -= 8; } while (webp.length > 100_000 && q > 30);
  await writeFile(new URL(`${id}.webp`, OUT), webp);
  console.log(`${id}: webp ${(webp.length / 1024).toFixed(0)}KB, png ${(png.length / 1024).toFixed(0)}KB`);
}
// the tray icon: the whole "pottle" sticker, trimmed to its outline and fitted into 96x96
const tray = await sharp(new URL("pottle.png", OUT).pathname).trim().resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await writeFile(new URL("tray.png", OUT), tray);
await rm(new URL("pottle-stickers.zip", OUT), { force: true }); // zip adds to an old archive, so start clean
execFileSync("zip", ["-q", "-j", "-r", new URL("pottle-stickers.zip", OUT).pathname, ...IDS.map((id) => new URL(`${id}.webp`, OUT).pathname), new URL("tray.png", OUT).pathname]);
console.log("tray 96x96 and pottle-stickers.zip written");
