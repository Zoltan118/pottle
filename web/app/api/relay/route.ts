import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pottleAbi } from "@/lib/abi";
import { CCTP, chain, POTTLE, TOKEN } from "@/lib/config";
import { erc20Abi } from "@/lib/abi";
import { allow, clientIp, forget } from "@/lib/limits";
import { verifyUser } from "@/lib/auth";
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
// - a cash out (an eip-3009 transfer the owner signed) is sponsored only for a signed-in pottle account
//   sending from its own wallet, from $1 / €1, ten a day per account (not per wallet, so making fresh
//   wallets earns nothing), never to the pottle contract, a token contract, circle's cctp contract, the
//   zero address or the sender itself
// - one signed authorization is broadcast once: a copy that arrives while the first is in flight is
//   refused, so the relayer never pays for the reverts of a payload fired many times at once
// - a reserve it never spends on chip-ins or cash outs, so automatic payouts and refunds always have gas, and a
//   floor under which it sends nothing at all
// whenever it declines, it answers { selfPay: true } and the app sends from the user's own wallet.

const MIN_SPONSORED = 1_000_000n; // 1.00 of the pot's currency
const RESERVE = 2_000_000n; // $2 of usdc kept back for payouts and refunds
const FLOOR = 300_000n; // below $0.30 the relayer stops sending anything
const MIN_VALIDITY = 120; // a signature must stay valid at least this long, so it cannot expire mid-flight
const STATUS = ["none", "open", "reached", "released", "refunding", "refunded"] as const;
const selfPay = (why: string) => NextResponse.json({ selfPay: true, error: why }, { status: 409 });

// authorizations broadcast in the last few minutes, so a duplicate of one in flight isn't sent again.
// per instance: the account limit for cash outs and the on-chain nonce cover what this can't
const inFlight = new Map<string, number>();
function claim(key: string) {
  const now = Date.now();
  if ((inFlight.get(key) ?? 0) > now) return false;
  inFlight.set(key, now + 10 * 60_000);
  if (inFlight.size > 5000) for (const [k, t] of inFlight) if (t <= now) inFlight.delete(k);
  return true;
}

/** a failed simulation, in words that are safe to send back: the contract's revert reason, or nothing */
function reason(e: unknown) {
  const text = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : "";
  const m = /reverted with the following reason:\s*([^\n]{1,120})/.exec(text) ?? /reverted with the custom error '([^']{1,80})'/.exec(text);
  return m ? `that payment can't go through: ${m[1].trim()}` : "that payment can't go through";
}

type Body =
  | { kind: "chip"; id: number; from: string; amount: string; name: string; validBefore: string; salt: string; v: number; r: string; s: string }
  | { kind: "send"; id?: undefined; currency: string; from: string; to: string; amount: string; validBefore: string; nonce: string; v: number; r: string; s: string }
  | { kind: "release" | "refund"; id: number };

const sig = (b: { v: number; r: string; s: string }) =>
  (b.v === 27 || b.v === 28) && typeof b.r === "string" && isHex(b.r) && b.r.length === 66 && typeof b.s === "string" && isHex(b.s) && b.s.length === 66;
const uint = (x: unknown) => typeof x === "string" && /^\d{1,20}$/.test(x);

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
  if (body.kind !== "chip" && body.kind !== "send" && body.kind !== "release" && body.kind !== "refund") return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  if (body.kind !== "send" && (!Number.isSafeInteger(body.id) || body.id < 1)) return NextResponse.json({ error: "bad pot id" }, { status: 400 });

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
  if (body.kind === "send") {
    const ok = (body.currency === "usd" || body.currency === "eur") && typeof body.from === "string" && isAddress(body.from) &&
      typeof body.to === "string" && isAddress(body.to) && typeof body.nonce === "string" && isHex(body.nonce) && body.nonce.length === 66 &&
      sig(body) && uint(body.amount) && uint(body.validBefore);
    if (!ok) return NextResponse.json({ error: "bad signature payload" }, { status: 400 });
    // money sent to these is gone: the contract and the tokens have no way to hand it back
    const to = body.to.toLowerCase();
    const blocked = [body.from, POTTLE, TOKEN.usd.address, TOKEN.eur.address, CCTP.tokenMessenger, "0x0000000000000000000000000000000000000000"].map((a) => (a ?? "").toLowerCase());
    if (blocked.includes(to)) return NextResponse.json({ error: "can't send to that address" }, { status: 400 });
  }
  // a cash out is only sponsored for a signed-in account, from one of its own wallets
  let userId = ""; // the dynamic user behind a cash out, which its limit is counted against
  if (body.kind === "send") {
    const who = await verifyUser(req);
    if (!who) return NextResponse.json({ error: "sign in again" }, { status: 401 });
    if (!who.wallets.includes(body.from.toLowerCase())) return NextResponse.json({ error: "not your wallet" }, { status: 403 });
    userId = who.sub;
  }

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const id = BigInt(body.id ?? 0);

  if (!allow(`ip:${clientIp(req)}`, 12, 60_000)) return selfPay("slow down");
  const gas = await publicClient.readContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (gas < FLOOR) {
    console.warn(`[pottle] relayer below its floor, ${Number(gas) / 1e6} usdc left, top it up: ${account.address}`);
    return selfPay("relayer empty");
  }

  let send: () => Promise<Hex>;
  let claimed = ""; // a per-pot settle slot or a cash-out allowance, given back if nothing gets sent
  let flying = ""; // this authorization's in-flight mark, cleared if it never gets broadcast
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
      flying = `chip:${body.id}:${body.from.toLowerCase()}:${body.salt}`;
      if (!claim(flying)) { flying = ""; return NextResponse.json({ error: "already on its way" }, { status: 429 }); }
    } else if (body.kind === "send") {
      if (BigInt(body.amount) < MIN_SPONSORED) return selfPay("under the sponsored minimum");
      if (BigInt(body.validBefore) < BigInt(Math.floor(Date.now() / 1000) + MIN_VALIDITY)) return selfPay("signature about to expire");
      if (gas < RESERVE) {
        console.warn(`[pottle] relayer at reserve, ${Number(gas) / 1e6} usdc left, top it up: ${account.address}`);
        return selfPay("relayer at reserve");
      }
      const { request } = await publicClient.simulateContract({
        account, address: TOKEN[body.currency as "usd" | "eur"].address, abi: erc20Abi, functionName: "transferWithAuthorization",
        args: [body.from as Address, body.to as Address, BigInt(body.amount), 0n, BigInt(body.validBefore), body.nonce as Hex, body.v, body.r as Hex, body.s as Hex],
      });
      send = () => wallet.writeContract(request);
      if (!allow(`send:${userId}`, 10, 86_400_000)) return selfPay("daily sponsored limit");
      claimed = `send:${userId}`;
      flying = `send:${body.currency}:${body.from.toLowerCase()}:${body.nonce}`;
      if (!claim(flying)) { flying = ""; return NextResponse.json({ error: "already on its way" }, { status: 429 }); }
    } else {
      // a payout or refund is sponsored only if it would move money, and at most once a minute per pot
      const [pot, status] = await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "getPot", args: [id] });
      const s = STATUS[Number(status)];
      const due = pot.raised > 0n && (body.kind === "release" ? s === "reached" || (s === "refunding" && pot.raised >= pot.goal) : s === "refunding");
      if (!due) return NextResponse.json({ error: "nothing to do" }, { status: 409 });
      if (!allow(`pot:${body.id}:${body.kind}`, 1, 60_000)) return NextResponse.json({ error: "already on its way" }, { status: 429 });
      claimed = `pot:${body.id}:${body.kind}`;
      const { request } = await publicClient.simulateContract({
        account, address: POTTLE, abi: pottleAbi, functionName: body.kind === "release" ? "release" : "refundAll", args: [id],
      });
      send = () => wallet.writeContract(request);
    }
  } catch (e) {
    // the transaction itself would fail: say why, there is nothing a different sender could change
    if (claimed) forget(claimed);
    console.warn("[pottle] relay simulation failed:", e instanceof Error ? e.message.slice(0, 300) : e);
    return NextResponse.json({ error: reason(e) }, { status: 422 });
  }

  try {
    const hash = await withNonceRetry(send);
    return NextResponse.json({ hash });
  } catch (e) {
    // it would have worked but the relayer could not send it (gas, nonce, rpc): the user's wallet can
    if (flying) inFlight.delete(flying);
    if (claimed) forget(claimed);
    console.warn("[pottle] relay send failed:", e instanceof Error ? e.message : e);
    return selfPay("relayer could not send");
  }
}
