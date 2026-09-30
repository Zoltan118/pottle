import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pottleAbi } from "./abi";
import { chain, POTTLE } from "./config";
import { publicClient } from "./pot";
import { withNonceRetry } from "./retry";

// pays pots out and refunds them without anyone pressing a button. the relayer only pays the
// network fee; the contract decides where the money goes, so this can never send it anywhere else.

// the contract's order. "refunded" means nothing is left to do (the older testnet contract never says it)
const STATUS = ["none", "open", "reached", "released", "refunding", "refunded"] as const;

function relayer() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !POTTLE) return null;
  const account = privateKeyToAccount(key as Hex);
  return { account, wallet: createWalletClient({ account, chain, transport: http() }) };
}

/** settles one pot if it is due. returns what it did */
export async function settlePot(id: number): Promise<"released" | "refunded" | "nothing"> {
  const r = relayer();
  if (!r || !POTTLE) return "nothing";
  const [pot, status] = await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "getPot", args: [BigInt(id)] });
  const s = STATUS[Number(status)];
  if ((s !== "reached" && s !== "refunding") || pot.raised === 0n) return "nothing";
  // a pot at its goal pays out first. if that fails (for example a blocklisted organiser) and refunds are
  // open (30 days after the deadline, or once anyone has had money back), refund everyone instead.
  // both are simulated, so the relayer never sends a transaction that would do nothing
  const order: ("release" | "refundAll")[] = pot.raised >= pot.goal ? ["release", "refundAll"] : ["refundAll"];
  let fn: "release" | "refundAll" = order[0];
  let request;
  for (let i = 0; ; i++) {
    fn = order[i];
    try {
      ({ request } = await publicClient.simulateContract({ account: r.account, address: POTTLE, abi: pottleAbi, functionName: fn, args: [BigInt(id)] }));
      break;
    } catch (e) {
      if (i === order.length - 1) throw e;
    }
  }
  const hash = await withNonceRetry(() => r.wallet.writeContract(request));
  // a bounded wait, well inside the job's time limit, and a reverted transaction is a failure, not a settle
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
  if (receipt.status !== "success") throw new Error(`${fn} reverted in ${hash}`);
  return fn === "release" ? "released" : "refunded";
}

/**
 * scans every pot and settles the ones that are due. used by the scheduled job.
 *
 * the audit found this could starve: it only looked at the newest 300 pots and spent its 20 slots on
 * pots it could do nothing with (empty or unpayable), so older pots stopped settling. now it reads the
 * status of every pot, skips the ones with nothing to do (the contract says "refunded" for those), counts
 * only transactions it actually sends, and starts each run at a different place in the due list so a pot
 * that keeps failing can never hold the others up. it stops at maxTx sends or when time runs short
 */
export async function settleDue(maxTx = 20, budgetMs = 45_000, scanBudgetMs = 15_000) {
  if (!POTTLE || !relayer()) return { scanned: 0, due: 0, unreadable: 0, settled: [] as { id: number; did: string }[], off: true };
  const started = Date.now();
  const count = Number(await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "potCount" }));
  // newest first, so recent pots always get looked at; the scan stops at its own time budget, and a run
  // that could not read some statuses says so instead of treating them as "nothing due"
  const ids = Array.from({ length: count }, (_, i) => count - i);
  const due: number[] = [];
  let scanned = 0, unreadable = 0;
  for (let i = 0; i < ids.length && Date.now() - started < scanBudgetMs; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const statuses = await publicClient.multicall({
      contracts: chunk.map((id) => ({ address: POTTLE!, abi: pottleAbi, functionName: "statusOf" as const, args: [BigInt(id)] as const })),
      allowFailure: true,
    });
    chunk.forEach((id, k) => {
      if (statuses[k].status !== "success") { unreadable++; return; }
      const st = STATUS[Number(statuses[k].result)];
      if (st === "reached" || st === "refunding") due.push(id);
    });
    scanned += chunk.length;
  }
  if (unreadable) console.warn(`[pottle] settle: ${unreadable} pot statuses could not be read`);
  // a different starting point each run (the run's minute), so nothing is always last in line
  const shift = due.length ? Math.floor(Date.now() / 60_000) % due.length : 0;
  const order = [...due.slice(shift), ...due.slice(0, shift)];
  const settled: { id: number; did: string }[] = [];
  for (const id of order) {
    if (settled.length >= maxTx || Date.now() - started > budgetMs) break;
    try {
      const did = await settlePot(id);
      if (did !== "nothing") settled.push({ id, did });
    } catch (e) {
      console.warn(`[pottle] settle ${id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { scanned, total: count, due: due.length, unreadable, settled, off: false };
}
