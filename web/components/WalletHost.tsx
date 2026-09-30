"use client";

import { useMountEffect } from "@/hooks/useMountEffect";
import { useWallet, walletStore } from "@/lib/walletStore";
import * as dyn from "@/lib/dynamicClient";
import { Sheet } from "./Sheet";
import { SignIn, readPending } from "./SignIn";

/**
 * works out once, on load, whether this device is signed in, and shows the sign-in sheet whenever a
 * page asks for it (the chip-in sheet draws the same fields inline instead). the sdk only loads here
 * for a device that was signed in last time, to pick its session back up, or one that was half way
 * through signing in when the page reloaded
 */
export default function WalletHost() {
  const w = useWallet();

  useMountEffect(() => {
    const pending = readPending();
    if (!walletStore.get().wasSignedIn && !pending) { walletStore.signedOut(); return; }
    let alive = true;
    dyn.session()
      .then((s) => { if (!alive) return; if (s) walletStore.signedIn(s); else walletStore.signedOut(); })
      .catch((e) => { console.warn("[pottle] could not restore the session:", e instanceof Error ? e.message : e); if (alive) walletStore.signedOut(); })
      .finally(() => { if (alive && pending && !walletStore.get().address) walletStore.reopen(); });
    return () => { alive = false; };
  });

  return (
    <Sheet open={!!w.prompt && !w.prompt.inline} onClose={() => walletStore.cancel()} label="sign in">
      {!!w.prompt && !w.prompt.inline && <SignIn />}
    </Sheet>
  );
}
