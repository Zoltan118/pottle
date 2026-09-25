import { createPublicClient, http, type Address } from "viem";
import { pottleAbi } from "./abi";
import { chain, CURRENCIES, POTTLE, TOKEN, type Currency } from "./config";

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

export const toUsd = (v: bigint) => Number(v) / 1e6;
export const fromUsd = (d: number) => BigInt(Math.round(d * 1e6));
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
