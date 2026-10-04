// the fee top-up for a first pot (lib/feeTopup.ts), run against arc testnet with real test usdc and
// fresh throwaway wallets. needs RELAYER_PRIVATE_KEY and NEXT_PUBLIC_POTTLE_ADDRESS (web/.env.local).
// node 23.6+ runs the typescript module directly
import { createPublicClient, createWalletClient, http, parseAbi, defineChain } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { topUpForFee } from "../lib/feeTopup.ts";

const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } } });
const USDC = "0x3600000000000000000000000000000000000000";
const POTTLE = process.env.NEXT_PUBLIC_POTTLE_ADDRESS;
const pub = createPublicClient({ chain, transport: http() });
const relayer = createWalletClient({ account: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY), chain, transport: http() });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const pot = parseAbi(["function create(uint128,uint64,uint8,uint8,string,string) returns (uint256)"]);
const bal = async (a) => Number(await pub.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [a] })) / 1e6;
const fresh = () => privateKeyToAccount(generatePrivateKey());
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++; };
const BIG = 10n ** 12n;

// 1. an empty new wallet gets a cent
const a = fresh();
const r1 = await topUpForFee({ to: a.address, usdc: USDC, pub, relayer, cap: BIG });
check(r1.sent && (await bal(a.address)) === 0.01, `an empty new wallet gets $0.01 (${JSON.stringify(r1.sent ? { sent: true } : r1)})`);

// 2. the cent really pays for pots, made from that wallet itself
const org = createWalletClient({ account: a, chain, transport: http() });
let made = 0;
for (;;) {
  try {
    const hash = await org.writeContract({ address: POTTLE, abi: pot, functionName: "create", args: [1_000_000n, BigInt(Math.floor(Date.now() / 1000) + 3600), 14, 0, "topup test, a longer title", "org"] });
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") break;
    made++;
  } catch { break; }
  if (made >= 8) break;
}
const left = await bal(a.address);
check(made >= 1, `$0.01 paid for ${made} pot${made === 1 ? "" : "s"} from the new wallet itself (left: $${left.toFixed(4)}, so one pot cost about $${((0.01 - left) / made).toFixed(4)})`);

// 3. and 4. the same wallet never gets it again: it has sent transactions now
const r2 = await topUpForFee({ to: a.address, usdc: USDC, pub, relayer, cap: BIG });
check(!r2.sent && (r2.reason === "not a new wallet" || r2.reason === "has enough"), `asking again gets nothing (${r2.reason}), and with $${left.toFixed(4)} left it is ${left < 0.01 ? "the nonce rule" : "the balance rule"} that stops it`);

// 5. two requests at once for one wallet: only one is paid
const b = fresh();
const [x, y] = await Promise.all([1, 2].map(() => topUpForFee({ to: b.address, usdc: USDC, pub, relayer, cap: BIG })));
check([x, y].filter((r) => r.sent).length === 1 && (await bal(b.address)) === 0.01, `two requests at the same moment: one paid, one refused (${[x, y].map((r) => r.sent ? "sent" : r.reason).join(", ")})`);

// 6. the daily cap: with the cap at what has already gone out today, the next new wallet gets nothing
const c = fresh();
const r3 = await topUpForFee({ to: c.address, usdc: USDC, pub, relayer, cap: 20_000n });
check(!r3.sent && r3.reason === "daily cap" && (await bal(c.address)) === 0, `the daily cap stops the next one (${r3.sent ? "sent" : r3.reason})`);

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
