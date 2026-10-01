"use client";

import type { WalletApi } from "@/app/providers";
import { encodeAbiParameters, keccak256, pad, parseSignature, toBytes, toHex, type Address, type Hex } from "viem";
import { erc20Abi, pottleAbi, tokenMessengerAbi } from "./abi";
import { CCTP, chain, CURRENCIES, POTTLE, TOKEN, type Currency } from "./config";
import { publicClient } from "./pot";

type Relayed = { hash: Hex } | { selfPay: true } | { skip: string };

async function relay(body: object): Promise<Relayed> {
  const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 503) return { selfPay: true }; // relay off, fall back to the user's own wallet
  const j = await r.json().catch(() => ({}));
  if (j.selfPay) return { selfPay: true }; // relay declined or could not send: the user's own wallet can
  if (r.status === 409 || r.status === 429) return { skip: j.error || "nothing to do" }; // not due, or already on its way
  if (!r.ok) throw new Error(j.error || "relay failed");
  return { hash: j.hash as Hex };
}

/** a transaction only counts once it is mined and succeeded; a reverted one is an error, not a success */
async function confirmed(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the transaction did not go through");
  return hash;
}

/** dollars or euros to token units, through whole cents so the amount always lands on the contract's cent grid */
const units = (d: number) => BigInt(Math.round(d * 100)) * 10_000n;

/** the eip-3009 nonce, computed here the same way the contract does, so no rpc can hand us one for another pot */
export const authNonce = (id: number, name: string, salt: Hex) =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }], [BigInt(id), keccak256(toBytes(name)), salt]));

// a signed chip-in that has not landed yet, kept so a retry reuses it rather than signing a second
// authorization that would stay valid alongside the first (and could be charged too)
type Signed = { salt: Hex; validBefore: bigint; v: number; r: Hex; s: Hex };
const pending = new Map<string, Promise<Signed>>();
/** signing out forgets every kept signature, so nothing signed stays around for the next person on this device */
export const forgetSignatures = () => pending.clear();

type Client = Awaited<ReturnType<WalletApi["client"]>>;

/** testnet: ask our drip for a little usdc. returns the amount sent, or 0 if nothing was needed */
export async function requestDrip(address: Address, authHeader: string) {
  const r = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json", authorization: authHeader }, body: JSON.stringify({ address }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "drip failed");
  return (j.amount as number | undefined) ?? 0;
}

export async function balanceOf(address: Address, c: Currency = "usd") {
  const b = await publicClient.readContract({ address: TOKEN[c].address, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  return Number(b) / 1e6;
}
/** a balance in whole cents, floored exactly from the token units, for amounts shown to the payer */
export async function balanceCents(address: Address, c: Currency = "usd") {
  const b = await publicClient.readContract({ address: TOKEN[c].address, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  return Number(b / 10_000n);
}
export const usdcBalance = (address: Address) => balanceOf(address, "usd");

export async function createPot(c: Client, a: { goal: number; deadline: number; wrap: number; currency: Currency; title: string; name: string }) {
  if (!POTTLE) throw new Error("pottle is not deployed yet");
  const hash = await c.writeContract({
    address: POTTLE, abi: pottleAbi, functionName: "create", chain, account: c.account,
    args: [units(a.goal), BigInt(a.deadline), a.wrap, CURRENCIES.indexOf(a.currency), a.title, a.name],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("the pot was not created");
  const pottle = POTTLE.toLowerCase();
  const log = receipt.logs.find((l) => l.address.toLowerCase() === pottle);
  if (!log?.topics[1]) throw new Error("pot not found in receipt");
  return Number(BigInt(log.topics[1]));
}

/** one signature, then the relayer (or the user's own wallet) submits it */
export async function chipIn(c: Client, a: { id: number; amount: number; name: string; currency: Currency }) {
  if (!POTTLE) throw new Error("pottle is not deployed yet");
  const from = c.account.address;
  const value = units(a.amount);
  const key = `${chain.id}:${a.id}:${from}:${value}:${a.name}`;
  // the same chip-in asked for twice at once shares one signature, so it can never be charged twice
  let signing = pending.get(key);
  const fresh = async (): Promise<Signed> => {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await c.signTypedData({
      account: c.account,
      // the pot's own token checks this signature, so it is signed for that token (usdc or eurc)
      domain: { name: TOKEN[a.currency].name, version: "2", chainId: chain.id, verifyingContract: TOKEN[a.currency].address },
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "ReceiveWithAuthorization",
      message: { from, to: POTTLE!, value, validAfter: 0n, validBefore, nonce: authNonce(a.id, a.name, salt) },
    });
    const { r, s, v, yParity } = parseSignature(signature);
    return { salt, validBefore, v: v !== undefined ? Number(v) : 27 + yParity, r, s };
  };
  // a kept signature is reused only while it has a few minutes left; a failed one never is
  const usable = async (p: Promise<Signed>) => {
    const got = await p.catch(() => null);
    return !!got && got.validBefore >= BigInt(Math.floor(Date.now() / 1000) + 180);
  };
  if (!signing || !(await usable(signing))) {
    signing = fresh();
    pending.set(key, signing);
    signing.catch(() => pending.delete(key)); // a declined signature is not kept
  }
  const signed = await signing;
  const { salt, validBefore, v: vNum, r, s } = signed;

  const relayed = await relay({ kind: "chip", id: a.id, from, amount: value.toString(), name: a.name, validBefore: validBefore.toString(), salt, v: vNum, r, s });
  const hash = "hash" in relayed ? relayed.hash : await c.writeContract({
    address: POTTLE, abi: pottleAbi, functionName: "chipInWithAuthorization", chain, account: c.account,
    args: [BigInt(a.id), from, value, a.name, 0n, validBefore, salt, vNum, r, s],
  });
  await confirmed(hash);
  pending.delete(key);
  return hash;
}

/** where a cash out must never go: money sent to the pot contract or a token contract cannot come back */
export function unsendable(to: string, from: string) {
  const t = to.toLowerCase();
  if (t === from.toLowerCase()) return "that's your own pottle wallet.";
  if ([POTTLE, TOKEN.usd.address, TOKEN.eur.address].some((a) => a?.toLowerCase() === t)) return "that's a pottle or token contract, not a wallet. money sent there is lost.";
  return "";
}

/**
 * cash out: sends usdc or eurc from the pottle wallet to any address on arc (an exchange deposit
 * address, another wallet). one signature; the relayer pays the network fee, so "all" really is all.
 * if the relayer declines, the wallet sends it itself, paying the fee in usdc
 */
export async function sendOut(c: Client, a: { to: Address; cents: number; currency: Currency }) {
  const from = c.account.address;
  const why = unsendable(a.to, from);
  if (why) throw new Error(why);
  const value = BigInt(a.cents) * 10_000n;
  const token = TOKEN[a.currency];
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await c.signTypedData({
    account: c.account,
    domain: { name: token.name, version: "2", chainId: chain.id, verifyingContract: token.address },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from, to: a.to, value, validAfter: 0n, validBefore, nonce },
  });
  const { r, s, v, yParity } = parseSignature(signature);
  const vNum = v !== undefined ? Number(v) : 27 + yParity;
  const relayed = await relay({ kind: "send", currency: a.currency, from, to: a.to, amount: value.toString(), validBefore: validBefore.toString(), nonce, v: vNum, r, s });
  if ("skip" in relayed) throw new Error(relayed.skip);
  // the same signed authorization, sent by the wallet itself: it can only ever move the money once
  const hash = "hash" in relayed ? relayed.hash : await c.writeContract({
    address: token.address, abi: erc20Abi, functionName: "transferWithAuthorization", chain, account: c.account,
    args: [from, a.to, value, 0n, validBefore, nonce, vNum, r, s],
  });
  return confirmed(hash);
}

/** cash out through base keeps this much usdc back for the two arc network fees it pays itself */
export const BASE_GAS_CENTS = 2;

/** circle's fee to deliver usdc on base, in token units. the higher quote, so the mint never stalls on a low cap */
export async function baseFee(amount: bigint) {
  const r = await fetch(`${CCTP.iris}/v2/burn/USDC/fees/${CCTP.arc}/${CCTP.base}?forward=true`);
  if (!r.ok) throw new Error("couldn't get circle's fee. try again in a minute.");
  const q = (await r.json()) as { finalityThreshold: number; minimumFee: number; forwardFee?: { high: number } }[];
  const fast = q.find((x) => x.finalityThreshold === 1000);
  if (!fast?.forwardFee) throw new Error("circle isn't delivering to base right now. try again later.");
  // the protocol fee is in basis points of the amount (zero from arc today), the forwarding fee is flat
  return BigInt(fast.forwardFee.high) + (amount * BigInt(Math.round(fast.minimumFee * 100))) / 1_000_000n;
}

/**
 * cash out to a usdc address on base (coinbase, a base wallet): burns usdc on arc through circle's cctp,
 * and circle's forwarding service mints it on base minus its fee. two arc transactions the wallet pays for
 * itself, an allowance (skipped when one is already there) and the burn. returns the burn's hash
 */
export async function sendViaBase(c: Client, a: { to: Address; cents: number; maxFee: bigint }) {
  const from = c.account.address;
  if (a.to.toLowerCase() === from.toLowerCase()) throw new Error("that's your pottle wallet. it can't spend usdc on base.");
  const amount = BigInt(a.cents) * 10_000n;
  if (a.maxFee >= amount) throw new Error("that's less than circle's fee.");
  const allowed = await publicClient.readContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "allowance", args: [from, CCTP.tokenMessenger] });
  if (allowed < amount) {
    await confirmed(await c.writeContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "approve", chain, account: c.account, args: [CCTP.tokenMessenger, amount] }));
  }
  return confirmed(await c.writeContract({
    address: CCTP.tokenMessenger, abi: tokenMessengerAbi, functionName: "depositForBurnWithHook", chain, account: c.account,
    args: [amount, CCTP.base, pad(a.to), TOKEN.usd.address, pad("0x"), a.maxFee, 1000, CCTP.forwardHook],
  }));
}

/** where a cash out through base is: the mint transaction on base once circle has done it */
export async function baseDelivery(burn: Hex): Promise<{ done: boolean; tx?: Hex }> {
  const r = await fetch(`${CCTP.iris}/v2/messages/${CCTP.arc}?transactionHash=${burn}`);
  if (r.status === 404) return { done: false }; // circle hasn't seen the burn yet
  if (!r.ok) throw new Error("couldn't check on it");
  const m = ((await r.json()) as { messages?: { forwardState?: string; forwardTxHash?: Hex }[] }).messages?.[0];
  if (m?.forwardState === "FAILED") throw new Error("circle couldn't finish it on base yet. it can still be delivered: send pottle the transaction link.");
  return { done: m?.forwardState === "CONFIRMED" && !!m.forwardTxHash, tx: m?.forwardTxHash };
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
  const relayed = await relay({ kind, id });
  // already settled, or already on its way: nothing to send. the page says which and refreshes
  if ("skip" in relayed) return { skipped: relayed.skip };
  return { hash: await confirmed("hash" in relayed ? relayed.hash : await own()) };
}
