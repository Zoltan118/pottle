import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { settlePot } from "@/lib/settle";
import { money, readPot } from "@/lib/pot";
import { readPotParam } from "@/lib/potLink";
import { POTTLE, DEPLOYED, NETWORK, OTHER_SITE } from "@/lib/config";
import { PotView } from "./PotView";
import { Mascot } from "@/components/Mascot";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // only the full link describes the pot: a bare or wrong number gets the plain site preview
  const link = readPotParam((await params).id);
  if (link.state !== "ok") return { title: "pottle", robots: { index: false, follow: false } };
  const pot = await readPot(link.id).catch((e) => {
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
  // a pot page names the people in it: shareable, but kept out of search results
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PotPage({ params }: Props) {
  const raw = (await params).id;
  const link = readPotParam(raw);
  const id = link.id;
  if (link.state === "bad") notFound();
  // pots are unlisted: a pot number without its key (or with the wrong one) opens nothing. the same page
  // whether the pot exists or not, so counting up the numbers tells nobody which pots are real
  if (link.state === "locked") {
    return (
      <main className="view"><section className="flow"><div className="lost-mascot"><Mascot mood="confused" level={0.4} /></div><h1 className="giant q">almost.</h1>
        <p className="hint" style={{ margin: 0 }}>this pot needs its full link, the part after the number too. ask whoever shared it to send it again.</p>
      </section></main>
    );
  }
  if (link.state === "off") {
    return (
      <main className="view"><section className="flow"><h1 className="giant q">soon.</h1>
        <div className="notice">{DEPLOYED ? "pots can't be opened right now. try again later." : <>setup needed: <code>POT_LINK_SECRET</code> in <code>.env.local</code></>}</div>
      </section></main>
    );
  }
  if (!POTTLE) {
    return (
      <main className="view"><section className="flow"><h1 className="giant q">soon.</h1>
        <div className="notice">{DEPLOYED ? "pottle isn't set up right now. try again later." : <>setup needed: <code>NEXT_PUBLIC_POTTLE_ADDRESS</code> in <code>.env.local</code></>}</div>
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
  // links shared while pottle.xyz still ran on testnet now point at mainnet: say where a test pot lives
  if (!pot && NETWORK === "mainnet" && OTHER_SITE) {
    return (
      <main className="view"><section className="flow"><div className="lost-mascot"><Mascot mood="confused" level={0.4} /></div><h1 className="giant q">no pot here.</h1>
        <p className="hint" style={{ margin: 0 }}>made it while pottle was in testing? test pots live on the test site.</p>
        <a className="btn lg" href={`${OTHER_SITE}/p/${raw}`}>open it on the test site</a>
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
