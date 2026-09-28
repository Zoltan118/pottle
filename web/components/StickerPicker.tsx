"use client";

import { useState, useSyncExternalStore } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { STICKERS, type Sticker } from "@/lib/stickerart";

/**
 * the stickers, set up for the phone in your hand. a website cannot install a whatsapp pack, so each
 * phone gets its own quickest path: iphones save a sticker and turn it into a system sticker (which
 * whatsapp's keyboard shows), android saves it and uses whatsapp's own "create" in the sticker tray,
 * and a laptop gets a qr code to carry the page to a phone. a published pack link, when there is
 * one, goes on top as the one-tap way
 */

type Platform = "ios" | "android" | "other";

function platformOf(): Platform {
  const ua = navigator.userAgent;
  // android first: an ipad says it is a mac with touch, which a touch-emulating laptop can also say
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}
const noop = () => () => {};

const STEPS: Record<Exclude<Platform, "other">, string[]> = {
  ios: [
    "tap a sticker below, then tap save image.",
    "open photos, touch and hold pottle, then tap add sticker.",
    "in whatsapp it waits in your emoji keyboard, under stickers.",
  ],
  android: [
    "tap a sticker below to save it.",
    "in whatsapp, open the sticker tray and tap create.",
    "pick the pottle you saved. it stays in your stickers.",
  ],
};

export function StickerPicker({ pack, pageUrl }: { pack?: string; pageUrl: string }) {
  const platform = useSyncExternalStore(noop, platformOf, () => "other" as Platform);
  const phone = platform !== "other";
  const [saved, setSaved] = useState<string | null>(null);

  // the phone's own share sheet has "save image" on iphone and "save" or whatsapp on android.
  // where files cannot be shared, fall back to a plain download
  async function save(s: Sticker) {
    const name = `pottle-${s.id}.png`;
    try {
      const blob = await (await fetch(`/stickers/${s.id}.png`)).blob();
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setSaved(s.id);
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // closed the sheet: nothing to do
    }
    const a = document.createElement("a");
    a.href = `/stickers/${s.id}.png`;
    a.download = name;
    a.click();
    setSaved(s.id);
  }

  return (
    <>
      {phone ? (
        <div className="sticker-steps">
          {pack && <a className="btn lg" href={pack} target="_blank" rel="noreferrer">add all 10 to whatsapp</a>}
          {pack && <p className="sticker-or">or one at a time, no app needed:</p>}
          <ol>
            {STEPS[platform].map((step, i) => <li key={i}><span>{i + 1}</span>{step}</li>)}
          </ol>
          {platform === "android" && <p className="sticker-note">no create in your sticker tray? update whatsapp, or <a href="/stickers/pottle-stickers.zip" download>download all 10</a> for a sticker maker app.</p>}
        </div>
      ) : (
        <CarryToPhone pageUrl={pageUrl} pack={pack} />
      )}

      <ul className="sticker-grid">
        {STICKERS.map((s) => (
          <li key={s.id}>
            {phone ? (
              <button type="button" className="sticker-tap" onClick={() => save(s)} aria-label={`save the ${s.caption} sticker`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/stickers/${s.id}.webp`} width={512} height={512} alt="" loading="lazy" />
                <span className="btn sm ghost">{saved === s.id ? "saved" : "save"}</span>
              </button>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/stickers/${s.id}.webp`} width={512} height={512} alt={`pottle sticker: ${s.caption}`} loading="lazy" />
                <a className="btn sm ghost" href={`/stickers/${s.id}.png`} download={`pottle-${s.id}.png`}>save</a>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="sticker-note sticker-spread">got a pottle sticker in a chat? tap it and add it to favourites. that&apos;s how they travel.</p>
    </>
  );
}

/** a laptop can hold the files, but stickers live on phones: a qr code carries the page over */
function CarryToPhone({ pageUrl, pack }: { pageUrl: string; pack?: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useMountEffect(() => {
    let alive = true;
    import("qrcode").then(({ toString }) => toString(pageUrl, { type: "svg", margin: 0, color: { dark: "#231A33", light: "#0000" } }))
      .then((svg) => { if (alive) setQr(svg); })
      .catch(() => {});
    return () => { alive = false; };
  });
  return (
    <div className="sticker-carry">
      {qr ? <div className="sticker-qr" role="img" aria-label={`qr code that opens ${pageUrl}`} dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="sticker-qr" />}
      <div>
        <p><b>stickers live on your phone.</b> scan this to open the page there, and it shows the quickest way for your phone.</p>
        <div className="sticker-carry-acts">
          {pack && <a className="btn sm" href={pack} target="_blank" rel="noreferrer">the whatsapp pack</a>}
          <a className="btn sm ghost" href="/stickers/pottle-stickers.zip" download>download all 10</a>
        </div>
      </div>
    </div>
  );
}
