import { notFound } from "next/navigation";
import { WalletCheck } from "./WalletCheck";

// development only: checks whether the wallet provider can switch to, sign on and send on this network
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WalletCheck />;
}
