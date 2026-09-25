import { createRemoteJWKSet, jwtVerify } from "jose";
import { DYNAMIC_ENV } from "./config";

// verifies a dynamic session token and returns the user id and the wallets on it
const jwks = DYNAMIC_ENV ? createRemoteJWKSet(new URL(`https://app.dynamicauth.com/api/v0/sdk/${DYNAMIC_ENV}/.well-known/jwks`)) : null;

export async function verifyDynamicToken(req: Request): Promise<{ sub: string; wallets: string[] } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
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
