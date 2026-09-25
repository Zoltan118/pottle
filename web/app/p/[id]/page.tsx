import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { settlePot } from "@/lib/settle";
import { money, readPot } from "@/lib/pot";
import { POTTLE } from "@/lib/config";
import { PotView } from "./PotView";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pot = await readPot(Number((await params).id)).catch((e) => {
    console.error("[pottle] metadata read failed:", e instanceof Error ? e.message : e);
    return null;
  });
  if (!pot) return { title: "pottle" };
  const title = `${pot.title} · pottle`;
  const description = `${money(pot.raised, pot.currency)} of ${money(pot.goal, pot.currency)}. chip in, or get it back.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PotPage({ params }: Props) {
  const id = Number((await params).id);
  if (!POTTLE) {
    return (
      <main className="view"><section className="flow"><h1 className="giant q">soon.</h1>
        <div className="notice">setup needed: <code>NEXT_PUBLIC_POTTLE_ADDRESS</code> in <code>.env.local</code></div>
      </section></main>
    );
  }
  // a pot that does not exist is a 404. a chain we cannot reach is not, so say that instead
  let pot;
  try {
    pot = await readPot(id);
  } catch (e) {
    console.error(`[pottle] could not read pot ${id} from arc:`, e instanceof Error ? e.message : e);
    return (
      <main className="view"><section className="flow"><h1 className="giant q">hold on.</h1>
        <div className="notice">can&apos;t reach arc right now. your money is safe in the pot. try again in a minute.</div>
      </section></main>
    );
  }
  if (!pot) notFound();
  // a pot that is due gets settled right after this page is sent, so whoever opens it next sees it done
  if (pot.status === "reached" || (pot.status === "refunding" && pot.raised > 0)) {
    after(() => settlePot(id).catch((e) => console.warn(`[pottle] settle on view ${id} failed:`, e instanceof Error ? e.message : e)));
  }
  return <PotView initial={pot} />;
}
