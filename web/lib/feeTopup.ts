import { parseAbi, type Address, type PublicClient, type WalletClient } from "viem";

/*
 * the fee for a first pot. making a pot is the one thing pottle can't sponsor: the contract records
 * whoever sends "create" as the organiser, so the organiser's own wallet has to send it, and on arc the
 * fee is paid in usdc. a brand new wallet holds nothing, so the relayer sends it a cent first. a pot
 * costs about half a cent, but the wallet must hold the most the fee could be before it sends, so a
 * cent is what reliably covers the first pot
 *
 * who gets it, checked on chain so it holds across restarts and instances:
 * - the wallet holds less than a cent, so it really can't pay
 * - the wallet has never sent a transaction itself (nonce 0). making a pot is a transaction, so after
 *   the first pot the wallet never qualifies again, and nothing else moves the cent out of it without
 *   a transaction of its own (pottle only sponsors chip-ins and cash outs of $1 or more)
 * on top of that the route allows it only to a signed-in account for its own wallet, a few times an
 * hour per ip, and at most DAILY_CAP a day in total on each server instance
 *
 * no app imports here, so scripts/topup-test.mjs can run it against testnet directly
 */

export const TOPUP = 10_000n; // $0.01: the first pot, with room for a long title
export const NEEDS_BELOW = 10_000n; // a wallet with a cent or more can pay its own fee
const RESERVE = 1_000_000n; // the relayer's own $1 for payouts and refunds (app/api/relay) stays untouched
export const DAILY_CAP = 2_000_000n; // $2 a day, about two hundred new organisers

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);

export type TopUpResult =
  | { sent: true; hash: `0x${string}`; amount: number }
  | { sent: false; reason: "has enough" | "not a new wallet" | "relayer low" | "daily cap" | "send failed" | "in flight" };

// best effort: serverless instances don't share memory, so the cap is per instance. the on-chain rules
// above are the real limit; the cap only bounds how fast someone farming fresh accounts could spend
let day = "", spentToday = 0n;
// a wallet being topped up right now: a second request for it is refused, and the next one sees the cent
const inFlight = new Set<string>();

export async function topUpForFee(opts: {
  to: Address; usdc: Address; pub: PublicClient; relayer: WalletClient & { account: { address: Address } }; cap?: bigint;
}): Promise<TopUpResult> {
  const { to, usdc, pub, relayer } = opts;
  const cap = opts.cap ?? DAILY_CAP;
  const key = to.toLowerCase();
  if (inFlight.has(key)) return { sent: false, reason: "in flight" };
  inFlight.add(key);
  try { return await topUp(to, usdc, pub, relayer, cap); } finally { inFlight.delete(key); }
}

async function topUp(to: Address, usdc: Address, pub: PublicClient, relayer: WalletClient & { account: { address: Address } }, cap: bigint): Promise<TopUpResult> {
  const [bal, nonce] = await Promise.all([
    pub.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [to] }),
    pub.getTransactionCount({ address: to }),
  ]);
  if (bal >= NEEDS_BELOW) return { sent: false, reason: "has enough" };
  if (nonce > 0) return { sent: false, reason: "not a new wallet" };

  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; spentToday = 0n; }
  if (spentToday + TOPUP > cap) return { sent: false, reason: "daily cap" };

  const pool = await pub.readContract({ address: usdc, abi: erc20, functionName: "balanceOf", args: [relayer.account.address] });
  if (pool < RESERVE + TOPUP) return { sent: false, reason: "relayer low" };

  spentToday += TOPUP; // counted before sending, so two requests on this instance can't both slip under the cap
  try {
    const hash = await relayer.writeContract({ address: usdc, abi: erc20, functionName: "transfer", args: [to, TOPUP], chain: relayer.chain, account: relayer.account });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("transfer reverted");
    return { sent: true, hash, amount: Number(TOPUP) / 1e6 };
  } catch {
    spentToday -= TOPUP;
    return { sent: false, reason: "send failed" };
  }
}
