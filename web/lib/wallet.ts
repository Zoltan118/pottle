"use client";

import type { WalletApi } from "@/app/providers";
import { parseSignature, toHex, type Address, type Hex } from "viem";
import { pottleAbi, usdcAbi } from "./abi";
import { chain, POTTLE, USDC } from "./config";
import { publicClient } from "./pot";

async function relay(body: object): Promise<Hex | null> {
  const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 503) return null; // relay off, fall back to the user's own wallet
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "relay failed");
  return j.hash as Hex;
}

type Client = Awaited<ReturnType<WalletApi["client"]>>;

/** testnet: ask our drip for a little usdc. returns the amount sent, or 0 if nothing was needed */
export async function requestDrip(address: Address, token: string | undefined) {
  const r = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` }, body: JSON.stringify({ address }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "drip failed");
  return (j.amount as number | undefined) ?? 0;
}

export async function usdcBalance(address: Address) {
  const b = await publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [address] });
  return Number(b) / 1e6;
}

export async function createPot(c: Client, a: { goal: number; deadline: number; title: string; name: string }) {
  if (!POTTLE) throw new Error("pottle is not deployed yet");
  const hash = await c.writeContract({
    address: POTTLE, abi: pottleAbi, functionName: "create", chain, account: c.account,
    args: [BigInt(Math.round(a.goal * 1e6)), BigInt(a.deadline), a.title, a.name],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const pottle = POTTLE.toLowerCase();
  const log = receipt.logs.find((l) => l.address.toLowerCase() === pottle);
  if (!log?.topics[1]) throw new Error("pot not found in receipt");
  return Number(BigInt(log.topics[1]));
}

/** one signature, then the relayer (or the user's own wallet) submits it */
export async function chipIn(c: Client, a: { id: number; amount: number; name: string }) {
  if (!POTTLE) throw new Error("pottle is not deployed yet");
  const from = c.account.address;
  const value = BigInt(Math.round(a.amount * 1e6));
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = await publicClient.readContract({ address: POTTLE, abi: pottleAbi, functionName: "authNonce", args: [BigInt(a.id), a.name, salt] });

  const signature = await c.signTypedData({
    account: c.account,
    domain: { name: "USDC", version: "2", chainId: chain.id, verifyingContract: USDC },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: { from, to: POTTLE, value, validAfter: 0n, validBefore, nonce },
  });
  const { r, s, v, yParity } = parseSignature(signature);
  const vNum = v !== undefined ? Number(v) : 27 + yParity;

  const hash =
    (await relay({ kind: "chip", id: a.id, from, amount: value.toString(), name: a.name, validBefore: validBefore.toString(), salt, v: vNum, r, s })) ??
    (await c.writeContract({
      address: POTTLE, abi: pottleAbi, functionName: "chipInWithAuthorization", chain, account: c.account,
      args: [BigInt(a.id), from, value, a.name, 0n, validBefore, salt, vNum, r, s],
    }));
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** release or refund: anyone can call, relayer first so it needs no wallet at all */
export async function settle(kind: "release" | "refund", id: number, c?: Client) {
  if (!POTTLE) throw new Error("pottle is not deployed yet");
  const pottle = POTTLE;
  const own = async () => {
    if (!c) throw new Error("sign in to do this");
    return c.writeContract({
      address: pottle, abi: pottleAbi, functionName: kind === "release" ? "release" : "refundAll", chain, account: c.account, args: [BigInt(id)],
    });
  };
  const hash = (await relay({ kind, id })) ?? (await own());
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
