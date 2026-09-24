import { createPublicClient, http, type Address } from "viem";
import { pottleAbi } from "./abi";
import { chain, POTTLE } from "./config";

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
  people: Person[];
};

export const toUsd = (v: bigint) => Number(v) / 1e6;
export const fromUsd = (d: number) => BigInt(Math.round(d * 1e6));
export const usd = (d: number) =>
  "$" + (Number.isInteger(d) ? d.toString() : d.toFixed(2));

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
    people: people
      .map((address, i) => ({ address, name: names[i], amount: toUsd(amounts[i]) }))
      .filter((p) => p.amount > 0 || s === "released"),
  };
}

/** "2 days left", "5 hours left", "ended" */
export function timeLeft(deadline: number, now = Date.now() / 1000) {
  const s = deadline - now;
  if (s <= 0) return "ended";
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600), m = Math.ceil(s / 60);
  if (d >= 1) return `${d} day${d > 1 ? "s" : ""} left`;
  if (h >= 1) return `${h} hour${h > 1 ? "s" : ""} left`;
  return `${m} min left`;
}

export const WRAPS = ["confetti", "stripes", "gingham", "plain"] as const;
export type Wrap = (typeof WRAPS)[number];
export const asWrap = (w: unknown): Wrap => (WRAPS as readonly unknown[]).includes(w) ? (w as Wrap) : "confetti";
