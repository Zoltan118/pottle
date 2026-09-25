import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pottleAbi } from "./abi";
import { chain, POTTLE } from "./config";
import { PAYOUT_GRACE, publicClient } from "./pot";
import { withNonceRetry } from "./retry";

// pays pots out and refunds them without anyone pressing a button. the relayer only pays the
// network fee; the contract decides where the money goes, so this can never send it anywhere else.

const STATUS = ["none", "open", "reached", "released", "refunding"] as const;

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
  let fn: "release" | "refundAll" | null = s === "reached" ? "release" : s === "refunding" && pot.raised > 0n ? "refundAll" : null;
  if (!fn) return "nothing";
  let request;
  try {
    ({ request } = await publicClient.simulateContract({ account: r.account, address: POTTLE, abi: pottleAbi, functionName: fn, args: [BigInt(id)] }));
  } catch (e) {
    // a pot that hit its goal but cannot pay out (for example a blocklisted organiser) becomes
    // refundable 30 days after its deadline. then refund everyone instead
    const stuck = fn === "release" && Date.now() / 1000 >= Number(pot.deadline) + PAYOUT_GRACE;
    if (!stuck) throw e;
    fn = "refundAll";
    ({ request } = await publicClient.simulateContract({ account: r.account, address: POTTLE, abi: pottleAbi, functionName: fn, args: [BigInt(id)] }));
  }
  const hash = await withNonceRetry(() => r.wallet.writeContract(request));
  await publicClient.waitForTransactionReceipt({ hash });
  return fn === "release" ? "released" : "refunded";
}

/** scans the newest pots and settles every one that is due. used by the scheduled job */
export async function settleDue(scan = 300, maxTx = 20) {
  if (!POTTLE || !relayer()) return { scanned: 0, settled: [] as { id: number; did: string }[], off: true };
  const count = Number(await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "potCount" }));
  const ids = Array.from({ length: Math.min(scan, count) }, (_, i) => count - i);
  const statuses = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: POTTLE!, abi: pottleAbi, functionName: "statusOf" as const, args: [BigInt(id)] as const })),
    allowFailure: true,
  });
  const due = ids.filter((_, i) => {
    const s = statuses[i].status === "success" ? STATUS[Number(statuses[i].result)] : "none";
    return s === "reached" || s === "refunding";
  });
  const settled: { id: number; did: string }[] = [];
  for (const id of due.slice(0, maxTx)) {
    try {
      const did = await settlePot(id);
      if (did !== "nothing") settled.push({ id, did });
    } catch (e) {
      console.warn(`[pottle] settle ${id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { scanned: ids.length, settled, off: false };
}
