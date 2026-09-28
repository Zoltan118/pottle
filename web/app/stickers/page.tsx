import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { STICKERS } from "@/lib/stickerart";

export const metadata: Metadata = {
  title: "stickers · pottle",
  description: "pottle stickers for the group chat: chip in?, i'm in!, goal hit!, thank you! and more.",
};

// the published whatsapp pack (sticker.ly or similar). until it is set, the page offers the files
const PACK = process.env.NEXT_PUBLIC_STICKER_PACK_URL;

export default function Stickers() {
  return (
    <main className="view">
      <Nav />
      <section className="shell stickers">
        <h1 className="giant">stickers.</h1>
        <p className="safe-vs">for the group chat. chip in?, i&apos;m in!, goal hit! and the rest.</p>
        <div className="ready-acts">
          {PACK
            ? <a className="btn lg" href={PACK} target="_blank" rel="noreferrer">add the pack to whatsapp</a>
            : <a className="btn lg" href="/stickers/pottle-stickers.zip" download>download all 10</a>}
          <Link className="btn lg ghost" href="/new">make a pot</Link>
        </div>

        <ul className="sticker-grid">
          {STICKERS.map((s) => (
            <li key={s.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/stickers/${s.id}.webp`} width={512} height={512} alt={`pottle sticker: ${s.caption}`} loading="lazy" />
              <a className="btn sm ghost" href={`/stickers/${s.id}.png`} download={`pottle-${s.id}.png`}>save</a>
            </li>
          ))}
        </ul>

        <div className="sticker-how">
          <h2>getting them into whatsapp</h2>
          {PACK && <p><b>the easy way:</b> tap &quot;add the pack to whatsapp&quot; above, then add it. all ten arrive at once.</p>}
          <p><b>iphone:</b> save a sticker, open it in photos, touch and hold pottle, then tap <b>add sticker</b>. it joins the stickers in your keyboard, ready for any chat.</p>
          <p><b>android:</b> download all ten, then open the zip in a sticker maker app to make a whatsapp pack.</p>
        </div>
      </section>
    </main>
  );
}
