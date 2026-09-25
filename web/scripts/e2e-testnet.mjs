// end-to-end on arc testnet with real usdc, through the running app's /api/relay.
// usage: npm run dev (in another shell), then: node scripts/e2e-testnet.mjs
// needs contracts/.env (DEPLOYER_PRIVATE_KEY with testnet usdc) and web/.env.local (NEXT_PUBLIC_POTTLE_ADDRESS)
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseSignature, toHex, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const env = (file) => Object.fromEntries(readFileSync(new URL(file, import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { DEPLOYER_PRIVATE_KEY } = env("../../contracts/.env");
const { NEXT_PUBLIC_POTTLE_ADDRESS: POTTLE, CRON_SECRET } = env("../.env.local");
const APP = process.env.APP_URL || "http://localhost:3000";
const USDC = "0x3600000000000000000000000000000000000000";
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
  "event PotCreated(uint256 indexed id, address indexed organiser, uint256 goal, uint256 deadline, string title)",
]);
const $ = (n) => BigInt(Math.round(n * 1e6));
const bal = async (a) => Number(await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [a] })) / 1e6;
const wait = (hash) => pub.waitForTransactionReceipt({ hash });
const STATUS = ["none", "open", "reached", "released", "refunding"];
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
check(refundErr.includes("422"), "refund refused before the deadline");
console.log("waiting for pot B's deadline…");
while ((await status(b)) !== "refunding") await new Promise((r) => setTimeout(r, 5000));
await relay({ kind: "refund", id: Number(b) });
check((await bal(ana.address)) === 2, "after the deadline, ana got her exact $1 back");
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
await fetch(`${APP}/p/${d}`);
let tries = 0;
while ((await status(d)) !== "released" && tries++ < 12) await new Promise((r) => setTimeout(r, 2500));
check((await status(d)) === "released", "opening pot D's page paid it out by itself");

console.log(`organiser ${org.account.address}`);
console.log(`pots: ${APP}/p/${a}  ${APP}/p/${b}`);
