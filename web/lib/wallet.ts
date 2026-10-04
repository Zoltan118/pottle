"use client";

import type { WalletApi } from "@/app/providers";
import { encodeAbiParameters, keccak256, pad, parseSignature, toBytes, toHex, type Address, type Hex } from "viem";
import { erc20Abi, pottleAbi, tokenMessengerAbi } from "./abi";
import { CCTP, chain, CURRENCIES, POTTLE, TOKEN, type Currency } from "./config";
import { publicClient } from "./pot";

type Relayed = { hash: Hex } | { selfPay: true } | { skip: string };

async function relay(body: object, auth = ""): Promise<Relayed> {
  const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
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

/** a cent from the relayer for the fee of someone's first pot, when their wallet is empty. true when they can now pay */
export async function requestFeeTopUp(address: Address, authHeader: string) {
  try {
    const r = await fetch("/api/topup", { method: "POST", headers: { "content-type": "application/json", authorization: authHeader }, body: JSON.stringify({ address }) });
    const j = await r.json();
    return j.sent === true || j.reason === "has enough";
  } catch {
    return false;
  }
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
  return { id: Number(BigInt(log.topics[1])), hash };
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

const ZERO = "0x0000000000000000000000000000000000000000";
/** where a cash out must never go: money sent to a contract that can't hand it back is lost */
export function unsendable(to: string, from: string) {
  const t = to.toLowerCase();
  if (t === from.toLowerCase()) return "that's your own pottle wallet.";
  if (t === ZERO) return "that's the zero address. money sent there is gone for good.";
  if ([POTTLE, TOKEN.usd.address, TOKEN.eur.address, CCTP.tokenMessenger].some((a) => a?.toLowerCase() === t)) return "that's a pottle, token or circle contract, not a wallet. money sent there is lost.";
  return "";
}

/** the token says this authorization has been used: the transfer it signed for has happened */
const used = (token: Address, from: Address, nonce: Hex) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "authorizationState", args: [from, nonce] }).catch(() => false);

// a cash out that was signed but not seen through, kept so a retry reuses it: the same signed transfer can
// only ever move the money once, where a fresh signature after an error could send it a second time
type SignedSend = { nonce: Hex; validBefore: bigint; v: number; r: Hex; s: Hex };
const sends = new Map<string, Promise<SignedSend>>();

/**
 * cash out: sends usdc or eurc from the pottle wallet to an address on arc (an exchange deposit address,
 * another wallet). one signature, and pottle's relayer pays the network fee, so "all" really is all. if
 * the relayer can't pay right now this stops and says so, rather than charging the wallet a fee.
 * onHash hears the transaction as soon as it exists. resolves with its hash, or "" when this exact
 * transfer had already gone through on an earlier try
 */
export async function sendOut(c: Client, a: { to: Address; cents: number; currency: Currency; auth: string; onHash?: (h: Hex) => void }) {
  const from = c.account.address;
  const why = unsendable(a.to, from);
  if (why) throw new Error(why);
  const value = BigInt(a.cents) * 10_000n;
  const token = TOKEN[a.currency];
  const key = `${chain.id}:${a.currency}:${from}:${a.to}:${value}`.toLowerCase();
  const fresh = async (): Promise<SignedSend> => {
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
    return { nonce, validBefore, v: v !== undefined ? Number(v) : 27 + yParity, r, s };
  };
  let signing = sends.get(key);
  const live = async (p: Promise<SignedSend>) => { const got = await p.catch(() => null); return !!got && got.validBefore >= BigInt(Math.floor(Date.now() / 1000) + 180); };
  if (!signing || !(await live(signing))) {
    signing = fresh();
    sends.set(key, signing);
    signing.catch(() => sends.delete(key)); // a declined signature is not kept
  }
  const sig = await signing;
  // an earlier try already went through: nothing more to send
  if (await used(token.address, from, sig.nonce)) { sends.delete(key); return ""; }
  let relayed: Relayed;
  try {
    relayed = await relay({ kind: "send", currency: a.currency, from, to: a.to, amount: value.toString(), validBefore: sig.validBefore.toString(), nonce: sig.nonce, v: sig.v, r: sig.r, s: sig.s }, a.auth);
  } catch (e) {
    if (await used(token.address, from, sig.nonce)) { sends.delete(key); return ""; }
    throw e;
  }
  if ("skip" in relayed) throw new Error("it's already on its way. check your balance in a minute before sending again.");
  if ("selfPay" in relayed) throw new Error("pottle can't cover the fee right now. try again in a few minutes.");
  a.onHash?.(relayed.hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: relayed.hash });
  // the relayer's copy can fail because the same transfer landed first (a duplicate, another tab): if
  // the token marks the authorization used, the money moved
  if (receipt.status !== "success" && !(await used(token.address, from, sig.nonce))) throw new Error("the transfer did not go through");
  sends.delete(key);
  return relayed.hash;
}

/**
 * through base the wallet pays two arc network fees itself (the allowance and the burn), so "all" keeps
 * back enough for them: today's gas price for generous gas amounts, doubled, never under 2 cents
 */
export async function baseGasCents() {
  const price = await publicClient.getGasPrice(); // usdc per gas, 18 decimals
  const cost = 320_000n * price * 2n; // ~70k allowance + ~250k burn, both generous
  return Math.max(2, Number((cost + 10n ** 16n - 1n) / 10n ** 16n)); // 1 cent = 1e16 at 18 decimals
}

/** circle's fee to deliver usdc on base, in token units. the higher quote, so the mint never stalls on a low cap */
export async function baseFee(amount: bigint) {
  const r = await fetch(`${CCTP.iris}/v2/burn/USDC/fees/${CCTP.arc}/${CCTP.base}?forward=true`);
  if (!r.ok) throw new Error("couldn't get circle's fee. try again in a minute.");
  const q = (await r.json()) as { finalityThreshold: number; minimumFee: number; forwardFee?: { high: number } }[];
  const fast = q.find((x) => x.finalityThreshold === 1000);
  if (!fast?.forwardFee || !(fast.forwardFee.high >= 0) || !(fast.minimumFee >= 0)) throw new Error("circle isn't delivering to base right now. try again later.");
  // the protocol fee is in basis points of the amount (zero from arc today), rounded up; the forwarding fee is flat
  const bps = BigInt(Math.ceil(fast.minimumFee * 100));
  return BigInt(fast.forwardFee.high) + (amount * bps + 999_999n) / 1_000_000n;
}

// a burn already made for the same cash out, so a retry after an error follows it instead of burning again
const burns = new Map<string, { hash: Hex; at: number }>();

/**
 * cash out to a usdc address on base (coinbase, a base wallet): burns usdc on arc through circle's cctp,
 * and circle's forwarding service mints it on base minus its fee, which is capped at maxFee. two arc
 * transactions the wallet pays for itself, an allowance (skipped when one is already there) and the
 * burn. onHash hears the burn as soon as it exists; resolves with its hash
 */
export async function sendViaBase(c: Client, a: { to: Address; cents: number; maxFee: bigint; onHash?: (h: Hex) => void }) {
  const from = c.account.address;
  if (a.to.toLowerCase() === from.toLowerCase()) throw new Error("that's your pottle wallet. it can't spend usdc on base.");
  const why = unsendable(a.to, from);
  if (why) throw new Error(why);
  const amount = BigInt(a.cents) * 10_000n;
  if (amount - a.maxFee < 1_000_000n) throw new Error("after circle's fee less than $1 would arrive. send a little more.");
  const key = `${chain.id}:${from}:${a.to}:${amount}`.toLowerCase();
  const before = burns.get(key);
  if (before && Date.now() - before.at < 30 * 60_000) { a.onHash?.(before.hash); return before.hash; }
  const allowed = await publicClient.readContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "allowance", args: [from, CCTP.tokenMessenger] });
  if (allowed < amount) {
    await confirmed(await c.writeContract({ address: TOKEN.usd.address, abi: erc20Abi, functionName: "approve", chain, account: c.account, args: [CCTP.tokenMessenger, amount] }));
  }
  const hash = await c.writeContract({
    address: CCTP.tokenMessenger, abi: tokenMessengerAbi, functionName: "depositForBurnWithHook", chain, account: c.account,
    args: [amount, CCTP.base, pad(a.to), TOKEN.usd.address, pad("0x"), a.maxFee, 1000, CCTP.forwardHook],
  });
  burns.set(key, { hash, at: Date.now() });
  a.onHash?.(hash);
  return confirmed(hash);
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
