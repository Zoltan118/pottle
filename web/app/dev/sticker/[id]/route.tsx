import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { ogFonts } from "@/lib/ogart";
import { STICKERS, StickerArt } from "@/lib/stickerart";

// dev only: renders one sticker at 512x512 on transparent. scripts/stickers.mjs saves them all
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  const s = STICKERS.find((x) => x.id === id);
  if (!s) notFound();
  return new ImageResponse(<StickerArt s={s} />, { width: 512, height: 512, fonts: await ogFonts() });
}
