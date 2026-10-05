// end-to-end on arc testnet with real usdc, through the running app's /api/relay.
// usage: npm run dev (in another shell), then: node scripts/e2e-testnet.mjs
// needs contracts/.env (DEPLOYER_PRIVATE_KEY with testnet usdc) and web/.env.local (NEXT_PUBLIC_POTTLE_ADDRESS)
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createPublicClient, createWalletClient, http, pad, parseSignature, toHex, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arcTestnet, baseSepolia } from "viem/chains";

const env = (file) => Object.fromEntries(readFileSync(new URL(file, import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { DEPLOYER_PRIVATE_KEY } = env("../../contracts/.env");
const { NEXT_PUBLIC_POTTLE_ADDRESS: POTTLE, CRON_SECRET, POT_LINK_SECRET } = env("../.env.local");
// a pot's full link, the same way lib/potLink.ts makes it (pots are unlisted: the bare number won't open)
const potLink = (id) => `/p/${id}-${BigInt(`0x${createHmac("sha256", POT_LINK_SECRET).update(`pottle:${arcTestnet.id}:${POTTLE.toLowerCase()}:${id}`).digest().subarray(0, 8).toString("hex")}`).toString(36).padStart(13, "0")}`;
const APP = process.env.APP_URL || "http://localhost:3000";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
if (!DEPLOYER_PRIVATE_KEY || !POTTLE) throw new Error("missing DEPLOYER_PRIVATE_KEY or NEXT_PUBLIC_POTTLE_ADDRESS");

const chain = arcTestnet;
const pub = createPublicClient({ chain, transport: http() });
const wallet = (pk) => createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http() });
const usdcAbi = parseAbi(["function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const potAbi = parseAbi([
  "function create(uint128,uint64,uint8,uint8,string,string) returns (uint256)",
  "function potsOf(address) view returns (uint256[])",
  "function chipIn(uint256,uint128,string)",
  "function authNonce(uint256,string,bytes32) pure returns (bytes32)",
  "function statusOf(uint256) view returns (uint8)",
  "function refundAll(uint256)",
  "event PotCreated(uint256 indexed id, address indexed organiser, uint256 goal, uint256 deadline, string title)",
]);
const $ = (n) => BigInt(Math.round(n * 1e6));
const bal = async (a) => Number(await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [a] })) / 1e6;
const wait = (hash) => pub.waitForTransactionReceipt({ hash });
const STATUS = ["none", "open", "reached", "released", "refunding", "refunded"];
const status = async (id) => STATUS[await pub.readContract({ address: POTTLE, abi: potAbi, functionName: "statusOf", args: [id] })];
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) process.exitCode = 1; };

async function relay(body) {
  const r = await fetch(`${APP}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`relay ${r.status}: ${j.error}`);
  await wait(j.hash);
  return j.hash;
}

async function signChip(pk, id, amount, name) {
  const acct = privateKeyToAccount(pk);
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = await pub.readContract({ address: POTTLE, abi: potAbi, functionName: "authNonce", args: [id, name, salt] });
  const sig = await acct.signTypedData({
    domain: { name: "USDC", version: "2", chainId: chain.id, verifyingContract: USDC },
    types: { ReceiveWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
    primaryType: "ReceiveWithAuthorization",
    message: { from: acct.address, to: POTTLE, value: $(amount), validAfter: 0n, validBefore, nonce },
  });
  const { r, s, v, yParity } = parseSignature(sig);
  return { kind: "chip", id: Number(id), from: acct.address, amount: $(amount).toString(), name, validBefore: validBefore.toString(), salt, v: v !== undefined ? Number(v) : 27 + yParity, r, s };
}

async function create(org, goal, secs, title) {
  const hash = await org.writeContract({ address: POTTLE, abi: potAbi, functionName: "create", args: [$(goal), BigInt(Math.floor(Date.now() / 1000) + secs), 1, 0, title, "org"] });
  const rc = await wait(hash);
  return BigInt(rc.logs.find((l) => l.address.toLowerCase() === POTTLE.toLowerCase()).topics[1]);
}

const deployer = wallet(DEPLOYER_PRIVATE_KEY);
const orgPk = generatePrivateKey(), anaPk = generatePrivateKey(), benPk = generatePrivateKey();
const org = wallet(orgPk), ben = wallet(benPk);
const ana = privateKeyToAccount(anaPk);
console.log(`pottle ${POTTLE} on ${chain.name}`);

// fund: ana only needs usdc (the relayer pays her fee); ben and the organiser pay their own fees
for (const [to, amt] of [[ana.address, 4], [ben.account.address, 1.1], [org.account.address, 0.3]]) {
  await wait(await deployer.writeContract({ address: USDC, abi: usdcAbi, functionName: "transfer", args: [to, $(amt)] }));
}

// pot A: goal hit, released
const a = await create(org, 3, 3600, "e2e gift");
await relay(await signChip(anaPk, a, 2, "ana"));
check((await bal(ana.address)) === 2, "ana chipped in $2 with one signature, relayer paid her fee");
await wait(await ben.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [POTTLE, $(1)] }));
await wait(await ben.writeContract({ address: POTTLE, abi: potAbi, functionName: "chipIn", args: [a, $(1), "ben"] }));
check((await status(a)) === "reached", "ben chipped in $1 the classic way, pot A reached its goal");
const orgBefore = await bal(org.account.address);
await relay({ kind: "release", id: Number(a) });
check((await status(a)) === "released", "pot A released through the relayer");
check(Math.abs((await bal(org.account.address)) - orgBefore - 3) < 1e-6, "organiser received exactly $3");

// pot B: deadline missed, refunded
const b = await create(org, 5, 40, "e2e miss");
await relay(await signChip(anaPk, b, 1, "ana"));
check((await bal(ana.address)) === 1, "ana chipped $1 into pot B");
let refundErr = "";
try { await relay({ kind: "refund", id: Number(b) }); } catch (e) { refundErr = e.message; }
check(refundErr.includes("409"), "refund refused before the deadline (relayer: nothing to do, no transaction)");
console.log("waiting for pot B's deadline…");
while ((await status(b)) !== "refunding") await new Promise((r) => setTimeout(r, 5000));
await relay({ kind: "refund", id: Number(b) });
check((await bal(ana.address)) === 2, "after the deadline, ana got her exact $1 back");
// the review's attack: a second refundAll on a pot with nothing left used to cost the sponsor gas for nothing
check((await status(b)) === "refunded", "pot B now reads refunded, so the settle job skips it");
let again = "";
try { await relay({ kind: "refund", id: Number(b) }); } catch (e) { again = e.message; }
check(again.includes("409"), "a second refund is refused by the relayer, no transaction sent");
let onchain = "";
try { await pub.simulateContract({ account: org.account, address: POTTLE, abi: potAbi, functionName: "refundAll", args: [b] }); } catch (e) { onchain = e.shortMessage ?? e.message; }
check(/revert/i.test(onchain), "and the contract itself refuses it (NothingToRefund), for anyone who calls it directly");
const mine = await pub.readContract({ address: POTTLE, abi: potAbi, functionName: "potsOf", args: [org.account.address] });
check(mine.length >= 2 && mine[0] === a && mine[1] === b, "potsOf lists the pots the organiser made");
const anas = await pub.readContract({ address: POTTLE, abi: potAbi, functionName: "potsOf", args: [ana.address] });
check(anas.length === 2, "potsOf lists both pots ana chipped into");
// automatic settling: pot C hits its goal and nobody presses anything; the scheduled job pays it out
const c = await create(org, 1, 3600, "e2e auto");
await relay(await signChip(anaPk, c, 1, "ana"));
check((await status(c)) === "reached", "pot C reached its goal and is left alone");
const orgBeforeC = await bal(org.account.address);
const job = await (await fetch(`${APP}/api/cron/settle`, { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json();
check(job.settled?.some((x) => x.id === Number(c) && x.did === "released"), `the settle job paid out pot C (${JSON.stringify(job.settled)})`);
check(Math.abs((await bal(org.account.address)) - orgBeforeC - 1) < 1e-6, "organiser received pot C's $1 without pressing anything");
const denied = await fetch(`${APP}/api/cron/settle`, { headers: { authorization: "Bearer wrong" } });
check(denied.status === 401, "the settle job refuses a wrong secret");

// settle on view: pot D hits its goal, then someone just opens the page
await wait(await deployer.writeContract({ address: USDC, abi: usdcAbi, functionName: "transfer", args: [ana.address, $(1)] }));
const d = await create(org, 1, 3600, "e2e view");
await relay(await signChip(anaPk, d, 1, "ana"));
check((await status(d)) === "reached", "pot D reached its goal");
// unlisted links: the bare number and a wrong code open nothing, the full link opens the pot
const bare = await (await fetch(`${APP}/p/${d}`)).text();
const wrong = await (await fetch(`${APP}/p/${d}-0000000000000`)).text();
check(bare.includes("needs its full link") && !bare.includes("e2e view"), "a pot's bare number doesn't open it");
check(wrong.includes("needs its full link") && !wrong.includes("e2e view"), "a wrong link code doesn't open it");
await fetch(`${APP}${potLink(d)}`);
let tries = 0;
while ((await status(d)) !== "released" && tries++ < 12) await new Promise((r) => setTimeout(r, 2500));
check((await status(d)) === "released", "opening pot D's page paid it out by itself");

// themed wraps: the contract takes any wrap value, so a pot with a wrap added after deployment (candles,
// number 15) is created as usual, and its link preview draws it
const wrapId = await (async () => {
  const hash = await org.writeContract({ address: POTTLE, abi: potAbi, functionName: "create", args: [$(5), BigInt(Math.floor(Date.now() / 1000) + 3600), 15, 0, "e2e birthday", "org"] });
  const rc = await wait(hash);
  return BigInt(rc.logs.find((l) => l.address.toLowerCase() === POTTLE.toLowerCase()).topics[1]);
})();
const og = await fetch(`${APP}${potLink(wrapId)}/opengraph-image`);
check(og.ok && (og.headers.get("content-type") ?? "").startsWith("image/"), `a pot with a themed wrap (candles) is created and its link preview renders (${og.status})`);

// cash out: the relayer's "send" job. a fresh wallet, so the relayer's own fee never mixes into the numbers
const sendTypes = { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] };
async function signSend(pk, currency, to, amount) {
  const acct = privateKeyToAccount(pk);
  const [name, token] = currency === "eur" ? ["EURC", EURC] : ["USDC", USDC];
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600), nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const sig = await acct.signTypedData({ domain: { name, version: "2", chainId: chain.id, verifyingContract: token }, types: sendTypes, primaryType: "TransferWithAuthorization",
    message: { from: acct.address, to, value: $(amount), validAfter: 0n, validBefore, nonce } });
  const { r, s: sv, v, yParity } = parseSignature(sig);
  return { kind: "send", currency, from: acct.address, to, amount: $(amount).toString(), validBefore: validBefore.toString(), nonce, v: v !== undefined ? Number(v) : 27 + yParity, r, s: sv };
}
const post = async (body) => { const r = await fetch(`${APP}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
const tokenBal = async (token, a) => pub.readContract({ address: token, abi: usdcAbi, functionName: "balanceOf", args: [a] });
const cashPk = generatePrivateKey(), cash = privateKeyToAccount(cashPk), dest = privateKeyToAccount(generatePrivateKey()).address;
await wait(await deployer.writeContract({ address: USDC, abi: usdcAbi, functionName: "transfer", args: [cash.address, $(3)] }));
await wait(await deployer.writeContract({ address: EURC, abi: usdcAbi, functionName: "transfer", args: [cash.address, $(1)] }));
for (const [to, what] of [[POTTLE, "the pottle contract"], [EURC, "a token contract"], ["0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", "circle's cctp contract"], [cash.address, "the sender itself"], ["0x0000000000000000000000000000000000000000", "the zero address"]]) {
  const [st] = await post(await signSend(cashPk, "usd", to, 1));
  check(st === 400, `a cash out to ${what} is refused before anything is sent`);
}
let [st] = await post({ ...(await signSend(cashPk, "usd", dest, 1)), r: "0x12" });
check(st === 400, "a malformed signature is refused");
[st] = await post(await signSend(cashPk, "usd", dest, 1));
check(st === 401, "a cash out without a signed-in pottle account isn't sponsored (fresh wallets earn nothing)");
// the signature rules the relayer depends on, checked against the tokens themselves: the script submits
const xferAbi = parseAbi(["function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)", "function authorizationState(address,bytes32) view returns (bool)"]);
const args = (b) => [b.from, b.to, BigInt(b.amount), 0n, BigInt(b.validBefore), b.nonce, b.v, b.r, b.s];
const reverts = async (token, b) => { try { await pub.simulateContract({ account: deployer.account, address: token, abi: xferAbi, functionName: "transferWithAuthorization", args: args(b) }); return false; } catch { return true; } };
const tampered = await signSend(cashPk, "usd", dest, 1); tampered.amount = $(2).toString();
check(await reverts(USDC, tampered), "a signature for $1 can't be used to send $2");
check(await reverts(EURC, await signSend(cashPk, "usd", dest, 1)), "a usdc signature can't move eurc");
const before = [await tokenBal(USDC, cash.address), await tokenBal(USDC, dest)];
const once = await signSend(cashPk, "usd", dest, 1);
await wait(await deployer.writeContract({ address: USDC, abi: xferAbi, functionName: "transferWithAuthorization", args: args(once) }));
const after = [await tokenBal(USDC, cash.address), await tokenBal(USDC, dest)];
check(before[0] - after[0] === $(1) && after[1] - before[1] === $(1), "a signed $1 usdc cash out lands exactly, and the sender pays no fee");
check(await pub.readContract({ address: USDC, abi: xferAbi, functionName: "authorizationState", args: [cash.address, once.nonce] }), "afterwards the token marks it used (how the app knows a retry already went through)");
check(await reverts(USDC, once), "the same signed cash out can't be sent twice");
const eurBefore = await tokenBal(EURC, dest);
await wait(await deployer.writeContract({ address: EURC, abi: xferAbi, functionName: "transferWithAuthorization", args: args(await signSend(cashPk, "eur", dest, 1)) }));
check((await tokenBal(EURC, dest)) - eurBefore === $(1), "a signed €1 eurc cash out lands exactly");

// cash out through base: circle's cctp burns on arc and its forwarding service mints on base sepolia
// the fee top-up for a first pot pays only a signed-in account (scripts/topup-test.mjs covers the rules)
const top = await fetch(`${APP}/api/topup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: cash.address }) });
check(top.status === 401, `a fee top-up without a signed-in pottle account is refused (${top.status})`);

if (process.env.E2E_SKIP_BASE) console.log("SKIP  cash out through base (E2E_SKIP_BASE set)");
else {
  const TM = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000";
  const tmAbi = parseAbi(["function depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes)"]);
  const base = createPublicClient({ chain: baseSepolia, transport: http() });
  const q = (await (await fetch("https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/26/6?forward=true")).json()).find((x) => x.finalityThreshold === 1000);
  const maxFee = BigInt(q.forwardFee.high);
  const c2 = wallet(cashPk), baseBefore = await base.readContract({ address: BASE_USDC, abi: usdcAbi, functionName: "balanceOf", args: [dest] });
  await wait(await c2.writeContract({ address: USDC, abi: usdcAbi, functionName: "approve", args: [TM, $(1)] }));
  const burn = await c2.writeContract({ address: TM, abi: tmAbi, functionName: "depositForBurnWithHook", args: [$(1), 6, pad(dest), USDC, pad("0x"), maxFee, 1000, HOOK] });
  await wait(burn);
  let landed = 0n;
  for (let i = 0; i < 36 && !landed; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    landed = (await base.readContract({ address: BASE_USDC, abi: usdcAbi, functionName: "balanceOf", args: [dest] })) - baseBefore;
  }
  check(landed > 0n && landed >= $(1) - maxFee, `cash out through base: $1 burned on arc, ${Number(landed) / 1e6} usdc arrived on base sepolia (fee cap ${Number(maxFee) / 1e6})`);
}

console.log(`organiser ${org.account.address}`);
console.log(`pots: ${APP}${potLink(a)}  ${APP}${potLink(b)}`);
