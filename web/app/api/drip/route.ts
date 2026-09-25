import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/auth";
import { allow, clientIp } from "@/lib/limits";
import { createWalletClient, http, isAddress, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, EURC, NETWORK, USDC, WALLETS_ON } from "@/lib/config";
import { publicClient } from "@/lib/pot";

// testnet only: sends a little usdc to a freshly signed-in wallet so nobody has to find a faucet.
// the caller must prove who they are (a dynamic session token or a circle user token), and the wallet
// must be one of theirs. wallets that already hold $1 or more get nothing.

const DRIP = 10_000_000n; // $10, usdc has 6 decimals
const HAS_ENOUGH = 1_000_000n; // $1
const REFILL_BELOW = 40_000_000n; // ask circle's faucet for more when the relayer drops under $40

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);

// best effort only: serverless instances do not share memory. the balance rule is the real limit
const recent = new Map<string, number>();

export async function POST(req: Request) {
  if (NETWORK !== "testnet") return NextResponse.json({ error: "testnet only" }, { status: 404 });
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !WALLETS_ON) {
    console.warn(`[pottle] drip off, missing: ${[!key && "RELAYER_PRIVATE_KEY", !WALLETS_ON && "a wallet provider (NEXT_PUBLIC_WALLET_PROVIDER + its key)"].filter(Boolean).join(", ")}`);
    return NextResponse.json({ error: "drip off" }, { status: 503 });
  }

  if (!allow(`drip:${clientIp(req)}`, 5, 3_600_000)) return NextResponse.json({ error: "too many requests, try later" }, { status: 429 });
  let address: string | undefined;
  try { address = (await req.json()).address; } catch {}
  if (!address || !isAddress(address)) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const who = await verifyUser(req);
  if (!who) return NextResponse.json({ error: "sign in again" }, { status: 401 });
  if (!who.wallets.includes(address.toLowerCase())) return NextResponse.json({ error: "not your wallet" }, { status: 403 });
  const sub = who.sub;

  const last = recent.get(sub);
  if (last && Date.now() - last < 12 * 3600_000) return NextResponse.json({ skipped: "already sent today" });

  const to = address as Address;
  const bal = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [to] });
  if (bal >= HAS_ENOUGH) return NextResponse.json({ skipped: "has usdc" });

  const account = privateKeyToAccount(key as Hex);
  const pool = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [account.address] });
  if (pool < REFILL_BELOW) void refill(account.address);
  if (pool < DRIP + HAS_ENOUGH) {
    console.warn(`[pottle] drip empty, relayer ${account.address} holds ${Number(pool) / 1e6} usdc`);
    return NextResponse.json({ error: "faucet is empty, try faucet.circle.com" }, { status: 503 });
  }

  const wallet = createWalletClient({ account, chain, transport: http() });
  const hash = await wallet.writeContract({ address: USDC, abi: erc20, functionName: "transfer", args: [to, DRIP] });
  recent.set(sub, Date.now());
  await publicClient.waitForTransactionReceipt({ hash });

  // euro pots need eurc. send €10 too when the relayer has some to spare (refill it at faucet.circle.com)
  let eur = 0;
  const [theirEur, poolEur] = await Promise.all([
    publicClient.readContract({ address: EURC, abi: erc20, functionName: "balanceOf", args: [to] }),
    publicClient.readContract({ address: EURC, abi: erc20, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (theirEur < HAS_ENOUGH && poolEur >= DRIP + HAS_ENOUGH) {
    const h2 = await wallet.writeContract({ address: EURC, abi: erc20, functionName: "transfer", args: [to, DRIP] });
    await publicClient.waitForTransactionReceipt({ hash: h2 });
    eur = Number(DRIP) / 1e6;
  } else if (poolEur < DRIP + HAS_ENOUGH) {
    console.warn(`[pottle] eurc drip empty, relayer holds ${Number(poolEur) / 1e6} eurc`);
  }
  return NextResponse.json({ hash, amount: Number(DRIP) / 1e6, eur });
}

/** top the relayer up from circle's faucet api. needs CIRCLE_API_KEY from a mainnet-upgraded circle account */
async function refill(address: Address) {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) return console.warn("[pottle] relayer low and CIRCLE_API_KEY not set, refill it at faucet.circle.com");
  try {
    const r = await fetch("https://api.circle.com/v1/faucet/drips", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-request-id": crypto.randomUUID() },
      body: JSON.stringify({ address, blockchain: "ARC-TESTNET", usdc: true }),
    });
    if (r.status !== 204) console.warn(`[pottle] circle faucet refill failed: ${r.status} ${await r.text()}`);
  } catch (e) {
    console.warn("[pottle] circle faucet refill failed", e);
  }
}
