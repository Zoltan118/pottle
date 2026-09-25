"use client";

import { useEffect } from "react";
import { DynamicContextProvider, getAuthToken, useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import type { Address } from "viem";
import { chain, DYNAMIC_ENV } from "@/lib/config";
import { walletStore } from "@/lib/walletStore";

const arcNetwork = {
  chainId: chain.id,
  networkId: chain.id,
  name: chain.name,
  vanityName: chain.name,
  rpcUrls: [...chain.rpcUrls.default.http],
  blockExplorerUrls: [chain.blockExplorers?.default.url ?? ""],
  iconUrls: ["/icon.svg"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
};

/** mirrors dynamic's state into the wallet store. this is the one place the app syncs with an outside system */
function Bridge() {
  const { primaryWallet, setShowAuthFlow, handleLogOut, sdkHasLoaded, user } = useDynamicContext();
  const loggedIn = useIsLoggedIn();
  const address = loggedIn ? (primaryWallet?.address as Address | undefined) : undefined;

  useEffect(() => {
    walletStore.set({
      on: true,
      ready: sdkHasLoaded,
      address,
      userId: user?.userId,
      signIn: () => setShowAuthFlow(true),
      signOut: () => void handleLogOut(),
      client: async () => {
        if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error("sign in first");
        await primaryWallet.switchNetwork(chain.id);
        return primaryWallet.getWalletClient(String(chain.id));
      },
      authHeader: () => `Bearer ${getAuthToken() ?? ""}`,
    });
  }, [sdkHasLoaded, address, user?.userId, primaryWallet, setShowAuthFlow, handleLogOut]);

  return null;
}

export default function DynamicHost() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV!,
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [arcNetwork] },
      }}
    >
      <Bridge />
    </DynamicContextProvider>
  );
}
