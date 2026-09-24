import type { Metadata } from "next";
import { CreateFlow } from "./CreateFlow";

export const metadata: Metadata = { title: "make a pot · pottle" };

export default function NewPot() {
  return <CreateFlow />;
}
