"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { dismissInstall, promptInstall, useInstall } from "@/lib/install";
import { CloseIcon } from "./Icons";

/** one quiet line that offers pottle on the home screen, for people who will keep coming back to a pot */
export function HomeScreenTip({ lead = "checking on it often?" }: { lead?: string }) {
  const { show, platform, canPrompt, inApp } = useInstall();
  const [open, setOpen] = useState(false);
  if (!show) return null;

  async function start() {
    if (canPrompt && (await promptInstall())) return; // android chrome: its own one-tap install
    setOpen(true);
  }

  return (
    <>
      <p className="a2hs">
        {lead} <button className="a2hs-go" onClick={start}>add pottle to your home screen</button>
        <button className="a2hs-x" onClick={dismissInstall} aria-label="not now"><CloseIcon /></button>
      </p>
      <Sheet open={open} onClose={() => setOpen(false)} label="add pottle to your home screen">
        <h2 className="giant">on your home screen.</h2>
        <ol className="a2hs-steps">
          {/* an app's own browser has no "add to home screen": the first step is getting to the real one */}
          {inApp && <li>this app&apos;s browser can&apos;t do it. tap <b>⋯</b> or <b>⋮</b>, then <b>open in {platform === "ios" ? "safari" : "chrome"}</b></li>}
          {platform === "ios" ? (
            <>
              <li>tap <b>share</b> <ShareIcon />{inApp ? " at the bottom of safari" : " in your browser. safari has it at the bottom, chrome and others next to the address bar"}</li>
              <li>scroll down, tap <b>add to home screen</b></li>
              <li>tap <b>add</b></li>
            </>
          ) : (
            <>
              <li>open your browser&apos;s <b>menu</b>: <b>⋮</b> in chrome and firefox, <b>≡</b> in samsung internet</li>
              <li>tap <b>add to home screen</b> or <b>install app</b></li>
              <li>tap <b>add</b> or <b>install</b></li>
            </>
          )}
        </ol>
        <p className="hint" style={{ margin: 0 }}>then open pottle from your home screen and sign in once with your email. it&apos;s the same wallet.</p>
        <button className="btn lg wide" onClick={() => setOpen(false)}>got it</button>
      </Sheet>
    </>
  );
}

/** the ios share glyph: a box with an arrow out of the top */
function ShareIcon() {
  return (
    <svg className="a2hs-icon" viewBox="0 0 24 24" aria-label="share icon">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
