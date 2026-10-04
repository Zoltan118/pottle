import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifyUser } from "@/lib/auth";
import { allow, clientIp } from "@/lib/limits";
import { chain, USDC, WALLETS_ON } from "@/lib/config";
import { publicClient } from "@/lib/pot";
import { topUpForFee } from "@/lib/feeTopup";

// the fee for someone's first pot, sent by the relayer (lib/feeTopup.ts has the rules). both networks:
// on testnet a new wallet usually has the $10 test gift already, so it rarely fires there
export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !WALLETS_ON) {
    console.warn(`[pottle] fee top-up off, missing: ${[!key && "RELAYER_PRIVATE_KEY", !WALLETS_ON && "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID"].filter(Boolean).join(", ")}`);
    return NextResponse.json({ error: "top-up off" }, { status: 503 });
  }
  if (!allow(`topup:${clientIp(req)}`, 5, 3_600_000)) return NextResponse.json({ error: "too many requests, try later" }, { status: 429 });
  let address: string | undefined;
  try { address = (await req.json()).address; } catch {}
  if (!address || !isAddress(address)) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const who = await verifyUser(req);
  if (!who) return NextResponse.json({ error: "sign in again" }, { status: 401 });
  if (!who.wallets.includes(address.toLowerCase())) return NextResponse.json({ error: "not your wallet" }, { status: 403 });

  const account = privateKeyToAccount(key as Hex);
  const relayer = createWalletClient({ account, chain, transport: http() });
  const r = await topUpForFee({ to: address as Address, usdc: USDC, pub: publicClient, relayer });
  if (r.sent) return NextResponse.json(r);
  if (r.reason === "relayer low") console.warn(`[pottle] fee top-up skipped, relayer low: ${account.address}`);
  // "has enough" is fine (they can pay); everything else means they need to add usdc themselves
  return NextResponse.json(r, { status: r.reason === "has enough" ? 200 : 409 });
}
