import "server-only";

// the relayer is one wallet. two transactions sent at the same instant can pick the same nonce and one
// is rejected. retry once after a short pause; anything else is a real error and is thrown as is.
export async function withNonceRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!/nonce|replacement transaction|already known/i.test(m)) throw e;
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    return send();
  }
}
