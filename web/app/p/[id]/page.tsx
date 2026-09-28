import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { settlePot } from "@/lib/settle";
import { money, readPot } from "@/lib/pot";
import { POTTLE } from "@/lib/config";
import { PotView } from "./PotView";
import { Mascot } from "@/components/Mascot";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pot = await readPot(Number((await params).id)).catch((e) => {
    console.error("[pottle] metadata read failed:", e instanceof Error ? e.message : e);
    return null;
  });
  if (!pot) return { title: "pottle" };
  const title = `${pot.title} · pottle`;
  // the text under the link in a group chat: who is collecting, how far along, and the promise
  const m = (d: number) => money(d, pot.currency);
  const description =
    pot.status === "released" ? `${pot.organiserName} collected ${m(pot.raised)} for ${pot.title}. thank you, everyone.`
    : pot.status === "refunding" ? `${pot.title} missed its goal, so everyone gets their money back.`
    : `${pot.organiserName} is collecting for ${pot.title}: ${m(pot.raised)} of ${m(pot.goal)} so far. hit it and it goes to ${pot.organiserName}, miss it and everyone gets their money back.`;
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
      <main className="view"><section className="flow"><div className="lost-mascot"><Mascot mood="confused" level={0.4} /></div><h1 className="giant q">hold on.</h1>
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
