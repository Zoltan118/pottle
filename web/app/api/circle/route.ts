import { NextResponse } from "next/server";
import { isAddress, isHex } from "viem";
import { circle, circleAppId, circleCode, circleWallet, CIRCLE_CHAIN } from "@/lib/circle";
import { allow, clientIp } from "@/lib/limits";

// the browser half of circle's email wallets calls this. each action forwards to circle with our api
// key; the user token in the body is the user's own, and anything that signs or moves money still has
// to be approved by the user in circle's screen.

type Body =
  | { action: "config" }
  | { action: "otp"; deviceId: string; email: string }
  | { action: "init"; userToken: string }
  | { action: "wallet"; userToken: string }
  | { action: "sign"; userToken: string; walletId: string; data: string }
  | { action: "exec"; userToken: string; walletId: string; contractAddress: string; callData: string }
  | { action: "lastTx"; userToken: string; walletId: string; since: number };

const bad = (error: string, status = 400, code?: number) => NextResponse.json({ error, code }, { status });

export async function POST(req: Request) {
  const c = circle();
  if (!c) {
    console.warn("[pottle] circle wallets off, missing: CIRCLE_API_KEY");
    return bad("circle wallets off", 503);
  }
  let b: Body;
  try { b = await req.json(); } catch { return bad("bad json"); }
  if (b.action === "config") {
    const appId = circleAppId();
    if (!appId) { console.warn("[pottle] circle wallets off, missing: CIRCLE_APP_ID"); return bad("circle wallets off", 503); }
    return NextResponse.json({ appId });
  }

  try {
    switch (b.action) {
      case "otp": {
        const email = String(b.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !b.deviceId) return bad("enter a valid email");
        if (!allow(`otp-ip:${clientIp(req)}`, 6, 600_000) || !allow(`otp-mail:${email}`, 3, 600_000)) return bad("too many codes, wait a few minutes", 429);
        const r = await c.createDeviceTokenForEmailLogin({ deviceId: b.deviceId, email });
        return NextResponse.json(r.data);
      }
      case "init": {
        try {
          const r = await c.createUserPinWithWallets({ userToken: b.userToken, blockchains: [CIRCLE_CHAIN], accountType: "EOA" });
          return NextResponse.json({ challengeId: r.data?.challengeId });
        } catch (e) {
          if (circleCode(e) === 155106) return NextResponse.json({ existing: true }); // already set up
          throw e;
        }
      }
      case "wallet": {
        return NextResponse.json((await circleWallet(b.userToken)) ?? { none: true });
      }
      case "sign": {
        if (typeof b.data !== "string" || b.data.length > 8000) return bad("bad typed data");
        const r = await c.signTypedData({ userToken: b.userToken, walletId: b.walletId, data: b.data });
        return NextResponse.json({ challengeId: r.data?.challengeId });
      }
      case "exec": {
        if (!isAddress(b.contractAddress) || !isHex(b.callData)) return bad("bad call");
        const r = await c.createUserTransactionContractExecutionChallenge({
          userToken: b.userToken, walletId: b.walletId, contractAddress: b.contractAddress, callData: b.callData,
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });
        return NextResponse.json({ challengeId: r.data?.challengeId });
      }
      case "lastTx": {
        const r = await c.listTransactions({ userToken: b.userToken, walletIds: [b.walletId], pageSize: 5 });
        const since = Number(b.since) || 0;
        const tx = (r.data?.transactions ?? [])
          .filter((t) => new Date(t.createDate).getTime() >= since - 5_000)
          .sort((x, y) => new Date(y.createDate).getTime() - new Date(x.createDate).getTime())[0];
        return NextResponse.json(tx ? { state: tx.state, txHash: tx.txHash, errorReason: tx.errorReason } : { none: true });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const code = circleCode(e);
    const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (e as Error)?.message ?? "circle error";
    return bad(code === 155104 ? "signed out, sign in again" : msg.slice(0, 160), code === 155104 ? 401 : 502, code);
  }
}
