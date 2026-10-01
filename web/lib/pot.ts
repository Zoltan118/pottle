import { createPublicClient, fallback, http, type Address } from "viem";
import { pottleAbi } from "./abi";
import { chain, CURRENCIES, POTTLE, TOKEN, type Currency } from "./config";

// on the server, an rpc of our own first (ARC_RPC_URL) with arc's public one behind it, so the settle job
// and the relayer don't depend on a single endpoint. browsers use the public one
const OWN_RPC = typeof window === "undefined" ? process.env.ARC_RPC_URL?.trim() : undefined;
export const publicClient = createPublicClient({ chain, transport: OWN_RPC ? fallback([http(OWN_RPC), http()]) : http() });

export type Status = "none" | "open" | "reached" | "released" | "refunding";
// the contract's order. its sixth status, "refunded" (refunds open and nothing left in the pot), reads as
// "refunding" with raised 0 here, which the pages already show as "everyone got their money back".
// the older testnet contract never returns it, so both contracts read the same
const STATUS: Status[] = ["none", "open", "reached", "released", "refunding", "refunding"];

export type Person = { address: Address; name: string; amount: number };
export type PotData = {
  id: number;
  title: string;
  organiser: Address;
  organiserName: string;
  goal: number; // dollars
  raised: number; // dollars
  deadline: number; // unix seconds
  status: Status;
  wrap: Wrap;
  currency: Currency;
  people: Person[];
};

/**
 * a pot id from a url: plain digits only, so "/p/0x10" or "/p/1e1" cannot open pot 16 or 10 under a
 * second address. anything else reads as no pot
 */
export const parsePotId = (raw: string) => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : NaN);

/**
 * titles and names are whatever anyone wrote on chain. before they reach a page, a preview or a share
 * message: invisible and direction-changing characters go (they can make one pot's name read like
 * another's), and newlines and runs of spaces become one space
 */
export const cleanText = (t: string) =>
  t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim() || "untitled";

/** token units (6 decimals) to a plain number of dollars or euros */
const toUsd = (v: bigint) => Number(v) / 1e6;
/** "$20", "€12.50" */
export const money = (d: number, c: Currency = "usd") =>
  TOKEN[c].symbol + (Number.isInteger(d) ? d.toString() : d.toFixed(2));
export const usd = (d: number) => money(d, "usd");

export async function readPot(id: number): Promise<PotData | null> {
  if (!POTTLE || !Number.isSafeInteger(id) || id < 1) return null;
  const [pot, status, people, names, amounts] = await publicClient.readContract({
    address: POTTLE,
    abi: pottleAbi,
    functionName: "getPot",
    args: [BigInt(id)],
  });
  const s = STATUS[Number(status)] ?? "none";
  if (s === "none") return null;
  return {
    id,
    title: cleanText(pot.title),
    organiser: pot.organiser,
    organiserName: cleanText(pot.organiserName),
    goal: toUsd(pot.goal),
    raised: toUsd(pot.raised),
    deadline: Number(pot.deadline),
    status: s,
    wrap: WRAPS[pot.wrap] ?? "confetti",
    currency: CURRENCIES[pot.currency] ?? "usd",
    people: people
      // everyone who took part stays listed, including people already refunded (amount 0), so a
      // missed pot still shows who was in rather than looking like nobody came
      .map((address, i) => ({ address, name: cleanText(names[i]), amount: toUsd(amounts[i]) })),
  };
}

/** every pot this address made or chipped into, newest first, at most `limit` */
export async function readPotsOf(address: Address, limit = 20): Promise<PotData[]> {
  if (!POTTLE) return [];
  const ids = await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "potsOf", args: [address] });
  const recent = [...ids].reverse().slice(0, limit).map(Number);
  const pots = await Promise.all(recent.map((id) => readPot(id)));
  return pots.filter((p): p is PotData => !!p);
}

export const potPath = (id: number) => `/p/${id}`;

/** whole cents as an integer. every amount the sheet compares goes through this, never through float maths */
export const toCents = (d: number) => Math.round(d * 100);

/**
 * what the chip-in sheet offers for a pot that has `raised` of `goal`, and can take at most `max` in total:
 * - `left`: what it still needs to hit the goal
 * - `room`: the most anyone can add right now (the beta cap on mainnet)
 * - `picks`: up to three one-tap amounts, the last of them always exactly "the rest" when that fits
 * anything else is typed in by hand. computed in whole cents: in dollars, 100 - 58.7 is 41.2999..., which
 * used to round "the rest" out of reach on a $100 pot
 */
export function chipOptions(goal: number, raised: number, max: number) {
  const leftC = Math.max(0, toCents(goal) - toCents(raised));
  const roomC = Math.max(0, toCents(max) - toCents(raised));
  const left = leftC / 100, room = roomC / 100;
  const base = [5, 10, 20, 50].filter((a) => toCents(a) <= roomC);
  const picks = leftC > 0 && leftC <= roomC
    // when a lot is still needed, the one-tap amounts stay at or under half of it, so a friend isn't nudged to cover it all
    ? [...base.filter((a) => toCents(a) < leftC && (left < 40 || a <= left / 2)), left].slice(-3)
    : base.slice(0, 3);
  return { left, room, picks };
}

/** the smallest amount the app asks for (pottle sponsors the fee from here up), unless less than that finishes the pot */
export const MIN_CHIP = 1;

/** most a pot can hold: the contract caps every pot at 100 during beta (MAX_POT). testnet runs the
 * exact contract mainnet does, so the cap is the same on both */
export const MAX_POT = 100;

/** the contract's PAYOUT_GRACE: a pot that hit its goal but still hasn't paid out this long after its
 * deadline becomes refundable. computed here so older contracts without it keep working */
export const PAYOUT_GRACE = 30 * 86400;
/** the goal was hit but the payout has not gone through for 30 days after the deadline. the current
 * contract then reports "refunding" while the money is still at the goal; older ones kept "reached" */
export const payoutStuck = (p: Pick<PotData, "status" | "deadline" | "raised" | "goal">, now = Date.now() / 1000) =>
  (p.status === "reached" && now >= p.deadline + PAYOUT_GRACE) || (p.status === "refunding" && p.raised > 0 && p.raised >= p.goal);

/** "2 days left", "5 hours left", "ended" */
export function timeLeft(deadline: number, now = Date.now() / 1000) {
  const s = deadline - now;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600), m = Math.ceil(s / 60);
  if (d >= 1) return `${d} day${d > 1 ? "s" : ""} left`;
  if (h >= 1) return `${h} hour${h > 1 ? "s" : ""} left`;
  return `${m} min left`;
}

// index matches the contract's wrap field, which accepts any value. new wraps are only ever appended,
// so a pot keeps its look; a value this app doesn't know yet shows as confetti
export const WRAPS = [
  "confetti", "stripes", "gingham", "plain", "hearts", "stars", "waves", "sprinkles",
  "boarding", "sunset", "palms", "cheers", "lemons", "forks", "balloons", "candles", // themed: lib/wraps.ts
] as const;
export type Wrap = (typeof WRAPS)[number];
