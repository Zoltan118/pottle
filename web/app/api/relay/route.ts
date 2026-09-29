import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pottleAbi } from "@/lib/abi";
import { chain, POTTLE, TOKEN } from "@/lib/config";
import { erc20Abi } from "@/lib/abi";
import { allow, clientIp } from "@/lib/limits";
import { withNonceRetry } from "@/lib/retry";
import { publicClient } from "@/lib/pot";

// pays the network fee so a friend only has to sign. every call is simulated first, so the
// relayer only spends on transactions that will succeed. the relayer never holds anyone's usdc.
//
// guards against someone draining its gas money with spam (tightened after the 2026-09-29 audit):
// - it only sponsors chip-ins of $1 / €1 or more; smaller ones pay their own tiny fee
// - a payload is fully checked before it counts against anyone's limits, and the per-wallet limit
//   only counts chip-ins whose signature passed simulation, so nobody can use up someone else's
// - payouts and refunds are only sponsored for a pot that is really due and has money in it, at most
//   once a minute per pot, so there are no free no-op transactions to spam
// - a reserve it never spends on chip-ins, so automatic payouts and refunds always have gas, and a
//   floor under which it sends nothing at all
// whenever it declines, it answers { selfPay: true } and the app sends from the user's own wallet.

const MIN_SPONSORED = 1_000_000n; // 1.00 of the pot's currency
const RESERVE = 2_000_000n; // $2 of usdc kept back for payouts and refunds
const FLOOR = 300_000n; // below $0.30 the relayer stops sending anything
const MIN_VALIDITY = 120; // a signature must stay valid at least this long, so it cannot expire mid-flight
const STATUS = ["none", "open", "reached", "released", "refunding", "refunded"] as const;
const selfPay = (why: string) => NextResponse.json({ selfPay: true, error: why }, { status: 409 });

type Body =
  | { kind: "chip"; id: number; from: string; amount: string; name: string; validBefore: string; salt: string; v: number; r: string; s: string }
  | { kind: "release" | "refund"; id: number };

export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !POTTLE) {
    console.warn(`[pottle] relay off, missing: ${[!key && "RELAYER_PRIVATE_KEY", !POTTLE && "NEXT_PUBLIC_POTTLE_ADDRESS"].filter(Boolean).join(", ")}`);
    return NextResponse.json({ error: "relay off" }, { status: 503 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad json" }, { status: 400 });
  if (!Number.isSafeInteger(body.id) || body.id < 1) return NextResponse.json({ error: "bad pot id" }, { status: 400 });
  if (body.kind !== "chip" && body.kind !== "release" && body.kind !== "refund") return NextResponse.json({ error: "unknown kind" }, { status: 400 });

  // the whole payload is checked before anything counts against a limit
  if (body.kind === "chip") {
    const ok =
      typeof body.from === "string" && isAddress(body.from) && typeof body.salt === "string" && isHex(body.salt) && body.salt.length === 66 &&
      typeof body.r === "string" && isHex(body.r) && body.r.length === 66 && typeof body.s === "string" && isHex(body.s) && body.s.length === 66 &&
      (body.v === 27 || body.v === 28) && typeof body.amount === "string" && /^\d{1,20}$/.test(body.amount) &&
      typeof body.validBefore === "string" && /^\d{1,20}$/.test(body.validBefore) &&
      typeof body.name === "string" && body.name.length > 0 && body.name.length <= 24;
    if (!ok) return NextResponse.json({ error: "bad signature payload" }, { status: 400 });
  }

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const id = BigInt(body.id);

  if (!allow(`ip:${clientIp(req)}`, 12, 60_000)) return selfPay("slow down");
  const gas = await publicClient.readContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (gas < FLOOR) {
    console.warn(`[pottle] relayer below its floor, ${Number(gas) / 1e6} usdc left, top it up: ${account.address}`);
    return selfPay("relayer empty");
  }

  let send: () => Promise<Hex>;
  try {
    if (body.kind === "chip") {
      if (BigInt(body.amount) < MIN_SPONSORED) return selfPay("under the sponsored minimum");
      if (BigInt(body.validBefore) < BigInt(Math.floor(Date.now() / 1000) + MIN_VALIDITY)) return selfPay("signature about to expire");
      if (gas < RESERVE) {
        console.warn(`[pottle] relayer at reserve, ${Number(gas) / 1e6} usdc left, top it up: ${account.address}`);
        return selfPay("relayer at reserve");
      }
      const { request } = await publicClient.simulateContract({
        account, address: POTTLE, abi: pottleAbi, functionName: "chipInWithAuthorization",
        args: [id, body.from as Address, BigInt(body.amount), body.name, 0n, BigInt(body.validBefore), body.salt as Hex, body.v, body.r as Hex, body.s as Hex],
      });
      send = () => wallet.writeContract(request);
      // only a chip-in whose signature checked out counts against that wallet's daily sponsored limit
      if (!allow(`from:${body.from.toLowerCase()}`, 20, 86_400_000)) return selfPay("daily sponsored limit");
    } else {
      // a payout or refund is sponsored only if it would move money, and at most once a minute per pot
      const [pot, status] = await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "getPot", args: [id] });
      const s = STATUS[Number(status)];
      const due = pot.raised > 0n && (body.kind === "release" ? s === "reached" || (s === "refunding" && pot.raised >= pot.goal) : s === "refunding");
      if (!due) return NextResponse.json({ error: "nothing to do" }, { status: 409 });
      if (!allow(`pot:${body.id}:${body.kind}`, 1, 60_000)) return NextResponse.json({ error: "already on its way" }, { status: 429 });
      const { request } = await publicClient.simulateContract({
        account, address: POTTLE, abi: pottleAbi, functionName: body.kind === "release" ? "release" : "refundAll", args: [id],
      });
      send = () => wallet.writeContract(request);
    }
  } catch (e) {
    // the transaction itself would fail: say why, there is nothing a different sender could change
    const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  try {
    const hash = await withNonceRetry(send);
    return NextResponse.json({ hash });
  } catch (e) {
    // it would have worked but the relayer could not send it (gas, nonce, rpc): the user's wallet can
    console.warn("[pottle] relay send failed:", e instanceof Error ? e.message : e);
    return selfPay("relayer could not send");
  }
}
