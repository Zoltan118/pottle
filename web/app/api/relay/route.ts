import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, isHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pottleAbi } from "@/lib/abi";
import { chain, POTTLE } from "@/lib/config";
import { publicClient } from "@/lib/pot";

// pays the network fee so a friend only has to sign. every call is simulated first, so the
// relayer only spends on transactions that will succeed. the relayer never holds anyone's usdc.

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
  if (!Number.isSafeInteger(body.id) || body.id < 1) return NextResponse.json({ error: "bad pot id" }, { status: 400 });

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const id = BigInt(body.id);

  try {
    let hash: Hex;
    if (body.kind === "chip") {
      const ok =
        isAddress(body.from) && isHex(body.salt) && body.salt.length === 66 && isHex(body.r) && isHex(body.s) &&
        (body.v === 27 || body.v === 28) && /^\d+$/.test(body.amount) && /^\d+$/.test(body.validBefore) &&
        typeof body.name === "string" && body.name.length > 0 && body.name.length <= 24;
      if (!ok) return NextResponse.json({ error: "bad signature payload" }, { status: 400 });
      const { request } = await publicClient.simulateContract({
        account, address: POTTLE, abi: pottleAbi, functionName: "chipInWithAuthorization",
        args: [id, body.from as Address, BigInt(body.amount), body.name, BigInt(0), BigInt(body.validBefore), body.salt as Hex, body.v, body.r as Hex, body.s as Hex],
      });
      hash = await wallet.writeContract(request);
    } else if (body.kind === "release" || body.kind === "refund") {
      const { request } = await publicClient.simulateContract({
        account, address: POTTLE, abi: pottleAbi, functionName: body.kind === "release" ? "release" : "refundAll", args: [id],
      });
      hash = await wallet.writeContract(request);
    } else {
      return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
    return NextResponse.json({ hash });
  } catch (e) {
    const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
