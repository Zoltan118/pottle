import { notFound } from "next/navigation";
import { NETWORK } from "@/lib/config";
import { LockCheck } from "./LockCheck";

// test site only: checks, from a real signed-in session, that the passkey lock can't be got around by
// someone who has only the account's email. see lockCheck in lib/dynamicClient.ts
export default function Page() {
  if (NETWORK !== "testnet") notFound();
  return <LockCheck />;
}
