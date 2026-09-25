import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DYNAMIC_ENV } from "./config";
import { circleWallet } from "./circle";

// who is calling? either a dynamic session token ("Bearer <jwt>") or a circle user token
// ("Circle <userToken>"). returns the user id and the wallets that belong to them, or null.
const jwks = DYNAMIC_ENV ? createRemoteJWKSet(new URL(`https://app.dynamicauth.com/api/v0/sdk/${DYNAMIC_ENV}/.well-known/jwks`)) : null;

export async function verifyUser(req: Request): Promise<{ sub: string; wallets: string[] } | null> {
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Circle ")) {
    try {
      const w = await circleWallet(h.slice(7));
      return w && w.userId ? { sub: w.userId, wallets: [w.address.toLowerCase()] } : null;
    } catch {
      return null;
    }
  }
  const token = h.replace(/^Bearer /, "");
  if (!token || !jwks) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ["RS256"] });
    const scope = String(payload.scope ?? "").split(" ");
    if (!String(payload.iss ?? "").endsWith(DYNAMIC_ENV!) || !scope.includes("user:basic") || !payload.sub) return null;
    const creds = (payload.verified_credentials ?? []) as { address?: string }[];
    return { sub: payload.sub, wallets: creds.map((c) => c.address?.toLowerCase()).filter(Boolean) as string[] };
  } catch {
    return null;
  }
}

/** kept for older imports */
export const verifyDynamicToken = verifyUser;
