import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPot, asWrap, usd } from "@/lib/pot";
import { POTTLE } from "@/lib/config";
import { PotView } from "./PotView";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ w?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pot = await readPot(Number((await params).id)).catch(() => null);
  if (!pot) return { title: "pottle" };
  const title = `${pot.title} · pottle`;
  const description = `${usd(pot.raised)} of ${usd(pot.goal)}. chip in, or get it back.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PotPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const wrap = asWrap((await searchParams).w);
  if (!POTTLE) {
    return (
      <main className="view"><section className="flow"><h1 className="giant q">soon.</h1>
        <div className="notice">setup needed: <code>NEXT_PUBLIC_POTTLE_ADDRESS</code> in <code>.env.local</code></div>
      </section></main>
    );
  }
  const pot = await readPot(id).catch(() => null);
  if (!pot) notFound();
  return <PotView initial={pot} wrap={wrap} />;
}
