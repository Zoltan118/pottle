// saves pottle's whatsapp sticker pack from the dev server: 512x512 webp (under 100KB each, what
// whatsapp asks for), png copies for iphone photos and sticker apps, a 96x96 tray icon, and a zip.
// run with the dev server up: node scripts/stickers.mjs
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const BASE = process.env.STICKER_BASE ?? "http://localhost:3000";
const IDS = ["chip-in", "im-in", "whos-in", "goal-hit", "thank-you", "tick-tock", "got-it-back", "hmm", "almost", "pottle"];
const OUT = new URL("../public/stickers/", import.meta.url);
await mkdir(OUT, { recursive: true });

for (const id of IDS) {
  let res;
  for (let tries = 0; ; tries++) { // the dev server sometimes drops a connection while compiling; try again
    try { res = await fetch(`${BASE}/dev/sticker/${id}`); if (res.ok) break; } catch (e) { if (tries > 3) throw e; }
    if (tries > 3) throw new Error(`sticker ${id}: ${res?.status}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const png = Buffer.from(await res.arrayBuffer());
  await writeFile(new URL(`${id}.png`, OUT), png);
  let q = 90, webp;
  do { webp = await sharp(png).webp({ quality: q, alphaQuality: 90 }).toBuffer(); q -= 8; } while (webp.length > 100_000 && q > 30);
  await writeFile(new URL(`${id}.webp`, OUT), webp);
  console.log(`${id}: webp ${(webp.length / 1024).toFixed(0)}KB, png ${(png.length / 1024).toFixed(0)}KB`);
}
// the tray icon: pottle without a caption would be ideal, the "pottle" sticker cropped to its pot works
const tray = await sharp(new URL("pottle.png", OUT).pathname).extract({ left: 66, top: 20, width: 380, height: 380 }).resize(96, 96).png().toBuffer();
await writeFile(new URL("tray.png", OUT), tray);
execFileSync("zip", ["-q", "-j", "-r", new URL("pottle-stickers.zip", OUT).pathname, ...IDS.map((id) => new URL(`${id}.webp`, OUT).pathname), new URL("tray.png", OUT).pathname]);
console.log("tray 96x96 and pottle-stickers.zip written");
