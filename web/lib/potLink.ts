import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { chain, NETWORK, POTTLE } from "./config";

/*
 * unlisted pot links. a pot's page lives at /p/<id>-<key>, where the key is a signature over the pot
 * number made with a secret only the server holds, so nobody can open pot 7 by counting up from pot 6.
 * no database: the key is recomputed and compared, never stored.
 *
 * this makes pots unlisted, not private. everything a pot page shows is also recorded on arc, which
 * anyone can read. the key keeps pots off pottle for people who were not sent the link
 *
 * the key covers the network, the contract and the pot number, so a link from one deployment never
 * opens a pot on another
 */

const SECRET = process.env.POT_LINK_SECRET || "";
if (!SECRET) console.warn("[pottle] POT_LINK_SECRET is not set: pot pages and new pot links are off until it is");

/** links are on: without the secret, pot pages say so instead of opening without a key */
export const LINKS_ON = !!SECRET;

// pots made before links were keyed. their short links are already in the docs, the walkthrough and
// group chats, so they keep working. every pot after these needs its full link
const OPEN_UPTO = NETWORK === "mainnet" ? 3 : 11;

const KEY_LEN = 13; // base36 characters, from 64 bits of the signature

function keyFor(id: number) {
  const mac = createHmac("sha256", SECRET).update(`pottle:${chain.id}:${(POTTLE ?? "").toLowerCase()}:${id}`).digest();
  return BigInt(`0x${mac.subarray(0, 8).toString("hex")}`).toString(36).padStart(KEY_LEN, "0");
}

/** the full path to share for a pot, or null while links are off */
export function potLink(id: number): string | null {
  if (!SECRET) return null;
  return `/p/${id}-${keyFor(id)}`;
}

/**
 * reads the last part of a pot url. "ok" opens the pot; "locked" is a real pot number without its key
 * (or a wrong one); "off" means the secret is missing; anything that isn't a pot number at all is "bad"
 */
export function readPotParam(raw: string): { id: number; state: "ok" | "locked" | "off" | "bad" } {
  const m = /^([1-9]\d{0,15})(?:-([0-9a-z]{1,32}))?$/.exec(decodeURIComponent(raw));
  if (!m) return { id: NaN, state: "bad" };
  const id = Number(m[1]);
  if (!m[2] && id <= OPEN_UPTO) return { id, state: "ok" };
  if (!SECRET) return { id, state: "off" };
  if (!m[2]) return { id, state: "locked" };
  const want = Buffer.from(keyFor(id)), got = Buffer.from(m[2]);
  return { id, state: want.length === got.length && timingSafeEqual(want, got) ? "ok" : "locked" };
}
