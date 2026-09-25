import { createPublicClient, http, type Address } from "viem";
import { pottleAbi } from "./abi";
import { chain, CURRENCIES, NETWORK, POTTLE, TOKEN, type Currency } from "./config";

export const publicClient = createPublicClient({ chain, transport: http() });

export type Status = "none" | "open" | "reached" | "released" | "refunding";
const STATUS: Status[] = ["none", "open", "reached", "released", "refunding"];

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
    title: pot.title,
    organiser: pot.organiser,
    organiserName: pot.organiserName,
    goal: toUsd(pot.goal),
    raised: toUsd(pot.raised),
    deadline: Number(pot.deadline),
    status: s,
    wrap: WRAPS[pot.wrap] ?? "confetti",
    currency: CURRENCIES[pot.currency] ?? "usd",
    people: people
      .map((address, i) => ({ address, name: names[i], amount: toUsd(amounts[i]) }))
      .filter((p) => p.amount > 0 || s === "released"),
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

const cents = (d: number) => Math.round(d * 100) / 100;

/**
 * what the chip-in sheet offers for a pot that has `raised` of `goal`, and can take at most `max` in total:
 * - `left`: what it still needs to hit the goal
 * - `room`: the most anyone can add right now (the beta cap on mainnet)
 * - `picks`: up to three one-tap amounts, the last of them always exactly "the rest" when that fits
 * anything else is typed in by hand
 */
export function chipOptions(goal: number, raised: number, max: number) {
  const left = Math.max(0, cents(goal - raised));
  const room = Math.max(0, Math.floor((max - raised) * 100) / 100);
  const base = [5, 10, 20, 50].filter((a) => a <= room);
  const picks = left > 0 && left <= room
    // when a lot is still needed, the one-tap amounts stay at or under half of it, so a friend isn't nudged to cover it all
    ? [...base.filter((a) => a < left && (left < 40 || a <= left / 2)), left].slice(-3)
    : base.slice(0, 3);
  return { left, room, picks };
}

/** the smallest amount the app asks for (pottle sponsors the fee from here up), unless less than that finishes the pot */
export const MIN_CHIP = 1;

/** most a pot can hold. mainnet's contract caps it at 100 during beta (MAX_POT); the testnet contract
 * is the earlier version, which only caps the goal, at 10,000 */
export const MAX_POT = NETWORK === "mainnet" ? 100 : 10_000;

/** the contract's PAYOUT_GRACE: a pot that hit its goal but still hasn't paid out this long after its
 * deadline becomes refundable. computed here so older contracts without it keep working */
export const PAYOUT_GRACE = 30 * 86400;
export const payoutStuck = (p: Pick<PotData, "status" | "deadline">, now = Date.now() / 1000) =>
  p.status === "reached" && now >= p.deadline + PAYOUT_GRACE;

/** "2 days left", "5 hours left", "ended" */
export function timeLeft(deadline: number, now = Date.now() / 1000) {
  const s = deadline - now;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600), m = Math.ceil(s / 60);
  if (d >= 1) return `${d} day${d > 1 ? "s" : ""} left`;
  if (h >= 1) return `${h} hour${h > 1 ? "s" : ""} left`;
  return `${m} min left`;
}

// index matches the contract's wrap field, 0 to 7
export const WRAPS = ["confetti", "stripes", "gingham", "plain", "hearts", "stars", "waves", "sprinkles"] as const;
export type Wrap = (typeof WRAPS)[number];
