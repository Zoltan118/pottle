import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { StickerPicker } from "@/components/StickerPicker";
import { SITE } from "@/lib/config";

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
        <p className="safe-vs">for the group chat. chip in?, i&apos;m in!, goal hit! and the rest. free, no app.</p>
        <StickerPicker pack={PACK} pageUrl={`${SITE}/stickers`} />
        <Link className="btn lg ghost sticker-make" href="/new">make a pot</Link>
      </section>
    </main>
  );
}
