import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DYNAMIC_ENV, NETWORK } from "@/lib/config";
import { SigninLab } from "./SigninLab";

// a test bench for signing in without dynamic's popup (their headless sdk, the way trustset does it),
// opened on a real phone inside whatsapp and friends before pottle's real sign-in moves to it.
// testnet only, never indexed, and it sends no money: the one signature it makes is checked, not submitted
export const metadata: Metadata = { title: "sign-in lab · pottle", robots: { index: false, follow: false } };

export default function Page() {
  if (NETWORK !== "testnet" || !DYNAMIC_ENV) notFound();
  return <SigninLab environmentId={DYNAMIC_ENV} />;
}
