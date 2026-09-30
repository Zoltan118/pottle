"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { walletStore } from "@/lib/walletStore";
import { Nav } from "@/components/Nav";
import { PotLive, type PotFeed } from "@/components/PotLive";
import { AddMoney, ONRAMP_ON } from "@/components/AddMoney";
import { Sheet } from "@/components/Sheet";
import { SignIn } from "@/components/SignIn";
import { balanceOf, chipIn, settle, requestDrip } from "@/lib/wallet";
import { chipOptions, MAX_POT, MIN_CHIP, money, payoutStuck, readPot, timeLeft, toCents, type PotData } from "@/lib/pot";
import { fitBytes, MAX_NAME_BYTES } from "@/lib/text";
import { explorerAddress, NETWORK, TOKEN } from "@/lib/config";
import { ShareIcon, ArrowOutIcon } from "@/components/Icons";
import { CountUp, type Counter } from "@/components/CountUp";
import { Celebrate } from "@/components/Celebrate";
import { YoureIn } from "@/components/YoureIn";
import { Mascot, type Mood } from "@/components/Mascot";


export function PotView({ initial }: { initial: PotData }) {
  const w = useWallet();
  const qc = useQueryClient();
  const feedRef = useRef<PotFeed | null>(null);
  const counters = useRef(new Set<Counter>()); // the totals on the page, which roll to each new amount
  const [party, setParty] = useState(false); // goal hit while the page was open
  const [fresh, setFresh] = useState<string | null>(null);
  const { data: pot = initial } = useQuery({
    queryKey: ["pot", initial.id],
    // each refresh is compared with the last one, and whatever changed is played on the pot
    queryFn: async () => {
      const next = (await readPot(initial.id)) ?? initial;
      const prev = qc.getQueryData<PotData>(["pot", initial.id]);
      if (prev && feedRef.current) {
        const level = next.goal ? next.raised / next.goal : 0;
        for (const p of next.people) {
          const before = prev.people.find((q) => q.address === p.address)?.amount ?? 0;
          if (p.amount > before) { feedRef.current.drop(`${p.name} · ${money(p.amount - before, next.currency)}`, level); setFresh(p.name); }
        }
        if (next.raised < prev.raised) feedRef.current.refund(level);
        if ((next.status === "reached" || next.status === "released") && prev.status === "open") {
          setTimeout(() => feedRef.current?.celebrate(), 500);
          setParty(true);
        }
      }
      if (prev && next.raised !== prev.raised) counters.current.forEach((c) => c.to(next.raised));
      return next;
    },
    initialData: initial,
    refetchInterval: 5_000,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<number | "other">(20);
  const [userPicked, setUserPicked] = useState(false); // once someone taps an amount, it stays theirs
  // the one-tap amounts are frozen while the sheet is open, so a chip-in landing meanwhile can't swap
  // the amount under the payer's thumb (and Enter can't pay a number they never saw)
  const [frozenPicks, setFrozenPicks] = useState<number[] | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"" | "signin" | "pay" | "settle">("");
  const [err, setErr] = useState("");
  const [short, setShort] = useState(0); // how much the payer is missing, offered as "add money"
  const [have, setHave] = useState(0); // what the payer holds, when it is less than they picked
  const [done, setDone] = useState<{ amount: number; hit: boolean; before: number; name: string } | null>(null); // the "you're in" moment

  // the payer's balance in this pot's currency, shared with the nav's balance pill
  const bal = useQuery({
    queryKey: [pot.currency === "eur" ? "eur" : "bal", w.address],
    queryFn: () => balanceOf(w.address!, pot.currency),
    enabled: !!w.address,
  });

  const m = (d: number) => money(d, pot.currency);
  const isOrganiser = (a: string) => a.toLowerCase() === pot.organiser.toLowerCase();
  const paid = pot.people;
  const latest = fresh ?? paid.at(-1)?.name;
  // one-tap amounts fitted to what the pot still needs (the last is exactly "the rest"), or any amount typed in
  const live = chipOptions(pot.goal, pot.raised, MAX_POT);
  const { left, room } = live;
  const picks = open && frozenPicks ? frozenPicks : live.picks;
  // the starting pick: $20 or the nearest below it, and never more than a signed-in payer holds
  const affordable = bal.data === undefined ? picks : picks.filter((a) => a <= bal.data!);
  const fallback = affordable.includes(20) ? 20 : (affordable.filter((a) => a <= 20).at(-1) ?? affordable[0] ?? picks[0] ?? 0);
  const other = picked === "other";
  const amount = other ? Number(typed) || 0 : picks.includes(picked) && (userPicked || affordable.includes(picked)) ? picked : fallback;
  const tooSmall = amount > 0 && toCents(amount) < toCents(MIN_CHIP) && toCents(amount) !== toCents(left);
  const tooBig = toCents(amount) > toCents(room);
  const valid = amount > 0 && !tooSmall && !tooBig;
  const missing = amount ? Math.max(0, Math.ceil((pot.goal - pot.raised) / amount)) : 0;
  const refreshed = () => qc.invalidateQueries({ queryKey: ["pot", pot.id] });
  const message = (e: unknown) =>
    e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong";

  async function pay() {
    if (!valid) return; // the amount is checked before sign-in, not after
    setErr(""); setShort(0); setHave(0);
    // not signed in yet: sign in, then carry on paying without another tap
    if (!walletStore.get().address) {
      setBusy("signin");
      // the email and code fields show right here in the chip-in sheet, and paying carries on by itself after
      const signedIn = await w.signIn({ inline: true });
      if (!signedIn) { setBusy(""); return; }
    }
    setBusy("pay");
    try {
      const cur = walletStore.get(); // after an await, read the live wallet, not this render's copy
      let held = await balanceOf(cur.address!, pot.currency);
      // testnet: someone who just signed in may not have had their free test dollars yet. ask, then look again
      if (held < amount && NETWORK === "testnet") {
        await requestDrip(cur.address!, cur.authHeader()).catch(() => 0);
        held = await balanceOf(cur.address!, pot.currency);
      }
      if (held < amount) {
        setShort(Math.ceil((amount - held) * 100) / 100);
        setHave(Math.floor(held * 100) / 100);
        throw new Error(`you have ${m(Math.floor(held * 100) / 100)}, ${m(amount)} needed.${ONRAMP_ON ? "" : ` add ${TOKEN[pot.currency].name.toLowerCase()} on arc to chip in.`}`);
      }
      const c = await cur.client();
      const nm = fitBytes(name.trim().toLowerCase(), MAX_NAME_BYTES) || "friend";
      await chipIn(c, { id: pot.id, amount, name: nm, currency: pot.currency });
      setDone({ amount, hit: pot.raised + amount >= pot.goal, before: pot.raised, name: nm }); setName("");
      refreshed();
      qc.invalidateQueries({ queryKey: [pot.currency === "eur" ? "eur" : "bal", cur.address] });
    } catch (e) { setErr(message(e)); } finally { setBusy(""); }
  }
  // the mascot in the chip-in sheet reacts to what you do: excited at "the rest", holding its breath
  // while paying, a wince if it fails
  const sheetMood: Mood = busy === "pay" || busy === "signin" ? "hold" : err ? "wince" : valid && amount === left ? "happy" : "idle";
  const closeSheet = () => { if (walletStore.get().waiting) walletStore.cancel(); setOpen(false); setFrozenPicks(null); setUserPicked(false); setErr(""); setShort(0); setHave(0); setDone(null); };
  const signingIn = busy === "signin" && !!w.prompt?.inline;
  const decided = new Date(pot.deadline * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function doSettle(kind: "release" | "refund") {
    setBusy("settle"); setErr("");
    try {
      const c = w.address ? await w.client() : undefined;
      await settle(kind, pot.id, c);
      refreshed();
    } catch (e) { setErr(message(e)); } finally { setBusy(""); }
  }

  const refundedAll = pot.status === "refunding" && pot.raised === 0;
  // the outcome, right under the amount, so a finished pot says what happened before anything else
  const finishedLine =
    pot.status === "reached" ? <p className="state ok">goal hit.</p>
    : pot.status === "released" ? <p className="state ok">it&apos;s on. {m(pot.raised)} went to {pot.organiserName}.</p>
    : pot.status === "refunding" ? <p className="state back">{refundedAll ? "missed. everyone got their money back." : "missed the goal. refunds are on their way."}</p>
    : null;
  const [qr, setQr] = useState<string | null>(null);
  const [shared, setShared] = useState("");
  const url = () => `${location.origin}/p/${pot.id}`;

  /** phones open the share sheet with the message ready; desktops copy it */
  async function send(text: string, label: string) {
    const full = `${text} ${url()}`;
    if (navigator.share) { try { await navigator.share({ text, url: url() }); } catch {} return; }
    try { await navigator.clipboard.writeText(full); setShared(label); setTimeout(() => setShared(""), 1600); } catch {}
  }
  /** share the pot with the group: the link, plus what is left to go */
  const shareToGroup = () => {
    const left = Math.max(0, pot.goal - pot.raised);
    send(`${m(left)} to go for ${pot.title}, ${timeLeft(pot.deadline)} 👀 chip in:`, "share");
  };
  const thanks = () => send(`${paid.length} friend${paid.length === 1 ? "" : "s"} chipped in ${m(pot.raised)} for ${pot.title} 🎁 thank you!`, "thanks");
  async function showQr() {
    const { toString } = await import("qrcode");
    setQr(await toString(url(), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#231A33", light: "#FFFFFF" } }));
  }

  return (
    <main className={`view w-${pot.wrap}`}>
      <Nav action={<Link className="btn sm ghost hide-sm" href="/new">make your own</Link>} />
      <section className="shell potpage">
        <div className="plate">
          <h1 className="giant">{pot.title}</h1>
          <div className="amount"><CountUp value={pot.raised} format={m} counters={counters} /> <small>of {m(pot.goal)}</small></div>
          {/* screen readers hear each chip-in as it lands */}
          <p className="sr-only" role="status" aria-live="polite">{fresh ? `${fresh} chipped in. ${m(pot.raised)} of ${m(pot.goal)}.` : ""}</p>
          {finishedLine}
          <button className="goesto" data-tip={pot.status === "refunding"
            ? `the pot missed its goal of ${m(pot.goal)}, so nobody got it. everyone who chipped in gets their money back.`
            : `${pot.organiserName} made this pot. hit ${m(pot.goal)} and all of it goes to ${pot.organiserName}'s wallet, ${pot.organiser.slice(0, 6)}…${pot.organiser.slice(-4)}, for ${pot.title}. miss it and everyone gets their money back.`}>
            {pot.status === "released" ? <>went to <b>{pot.organiserName}</b></> : pot.status === "refunding" ? <>goes back to <b>everyone</b></> : <>goes to <b>{pot.organiserName}</b></>}
          </button>
          {/* the name is whatever the organiser typed; the wallet is the part nobody can copy */}
          {pot.status !== "refunding" && (
            <a className="orgwallet" href={explorerAddress(pot.organiser)} target="_blank" rel="noreferrer" data-tip={`the wallet this pot pays out to. check it is ${pot.organiserName}'s before you chip in`}>
              wallet {pot.organiser.slice(0, 6)}…{pot.organiser.slice(-4)}<ArrowOutIcon />
            </a>
          )}
          <div className="meta">
            <span><b>{paid.length}</b> {pot.status === "refunding" ? (paid.length === 1 ? "was" : "were") : ""} in</span>
            <span><b>{pot.status === "released" ? "paid out" : pot.status === "refunding" ? "ended" : pot.status === "reached" ? "goal hit" : timeLeft(pot.deadline)}</b></span>
            {!(pot.status === "released" || refundedAll) && <button className="tipword" style={{ color: "var(--muted)" }} data-tip={`nobody can take this early. hit ${m(pot.goal)} and it goes to ${pot.organiserName}. miss it and everyone gets their money back.${NETWORK === "mainnet" ? ` pottle is in beta with no third-party audit yet, so each pot holds at most ${m(MAX_POT)}.` : ""}`}>safe?</button>}
          </div>

          <div className="faces" role="group" aria-label={`${paid.length} people ${pot.status === "refunding" ? "were" : ""} in`}>
            {paid.slice(0, 8).map((p) => (
              <span key={p.address} role="img" aria-label={`${p.name}${isOrganiser(p.address) ? ", organiser" : ""}, ${p.amount > 0 ? m(p.amount) : "refunded"}`} className={`face${p.name === fresh ? " new" : ""}${isOrganiser(p.address) ? " org" : ""}`} data-tip={`${p.name}${isOrganiser(p.address) ? " · organiser" : ""} · ${p.amount > 0 ? m(p.amount) : "refunded"}`} tabIndex={0}>{p.name[0]}</span>
            ))}
            {paid.length > 8 && <span className="face more" role="img" aria-label={`and ${paid.length - 8} more: ${paid.slice(8).map((p) => p.name).join(", ")}`} data-tip={paid.slice(8).map((p) => p.name).join(", ")} tabIndex={0}>+{paid.length - 8}</span>}
            {pot.status === "open" && Array.from({ length: Math.min(missing, 3) }, (_, i) => <span key={i} className="face out" aria-hidden="true">?</span>)}
          </div>

          {pot.status === "open" && latest && <p className="latest">latest: <b>{latest}</b></p>}
          {pot.status === "open" && (
            <div className="potcta">
              {/* phones: the pinned bar carries the progress, so it still reads when the card has scrolled away */}
              <div className="potcta-meta" aria-hidden="true">
                <span className="potcta-track"><i style={{ width: `${Math.min(100, pot.goal ? (pot.raised / pot.goal) * 100 : 0)}%` }} /></span>
                <span><b><CountUp value={pot.raised} format={m} counters={counters} /></b> of {m(pot.goal)} · {paid.length} in</span>
              </div>
              <div className="potcta-row">
                <button className="btn lg ghost potcta-share" onClick={shareToGroup} aria-label="share this pot">
                  <ShareIcon />
                </button>
                <button className="btn lg wide" onClick={() => { setFrozenPicks(live.picks); setOpen(true); }}>{valid ? <>i&apos;m in · {m(amount)}</> : <>i&apos;m in</>}</button>
              </div>
            </div>
          )}
          {pot.status === "reached" && (
            <>
              <button className="btn lg wide" onClick={() => doSettle("release")} disabled={!!busy}>{busy ? "sending…" : `send it to ${pot.organiserName}`}</button>
              {payoutStuck(pot) && (
                <button className="btn sm ghost" onClick={() => doSettle("refund")} disabled={!!busy}
                  data-tip="this pot couldn't pay out for 30 days after its deadline, so everyone can take their money back.">payout stuck? refund everyone</button>
              )}
            </>
          )}
          {pot.status === "refunding" && !refundedAll && (
            <button className="btn lg wide" onClick={() => doSettle("refund")} disabled={!!busy}>{busy ? "refunding…" : "refund everyone"}</button>
          )}
          <div className="acts">
            {pot.status === "open" && <button className="btn sm ghost" onClick={shareToGroup} data-tip="send the pot to the group, with what's left to go"><ShareIcon />{shared === "share" ? "copied" : "share"}</button>}
            {pot.status === "released" && <button className="btn sm" onClick={thanks} data-tip="share the thank-you card">{shared === "thanks" ? "copied" : "share the thank-you"}</button>}
            <button className="btn sm ghost" onClick={showQr} data-tip="scan to chip in">qr</button>
          </div>
          <div className="err" role="alert">{!open && err}</div>
        </div>
        <PotLive people={initial.people} goal={pot.goal} level={pot.goal ? pot.raised / pot.goal : 0} status={initial.status} currency={initial.currency} feedRef={feedRef} deadline={pot.deadline} />
      </section>
      <div className="shell potfoot"><Link className="btn sm ghost" href="/new">make your own pot</Link></div>

      {party && <Celebrate onDone={() => setParty(false)} />}
      <Sheet open={!!qr} onClose={() => setQr(null)} label="scan to chip in">
        <h2 className="giant">scan.</h2>
        {qr && <div className="qr" role="img" aria-label={`qr code that opens ${pot.title} on pottle`} dangerouslySetInnerHTML={{ __html: qr }} />}
        <p className="hint" style={{ margin: 0 }}>{pot.title} · {m(pot.raised)} of {m(pot.goal)}</p>
      </Sheet>

      <Sheet open={open} onClose={closeSheet} label="chip in">
        {done ? (
          <>
            <h2 className="giant">you&apos;re in.</h2>
            <YoureIn label={`${done.name} · ${m(done.amount)}`} before={done.before} after={done.before + done.amount} goal={pot.goal} format={m} />
            <p className="where">
              {done.hit
                ? <><b>{m(done.amount)}</b> in, and that hit the goal. it goes to <b>{pot.organiserName}</b>.</>
                : <><b>{m(done.amount)}</b> in for {pot.title}. if the pot hits {m(pot.goal)} by <b>{decided}</b>, it goes to <b>{pot.organiserName}</b>. if it doesn&apos;t, it comes back to you automatically.</>}
            </p>
            <div className="acts">
              <button className="btn lg" onClick={shareToGroup}><ShareIcon />{shared === "share" ? "copied" : "tell the group"}</button>
              <button className="btn lg ghost" onClick={closeSheet}>done</button>
            </div>
            <Link className="hint sticker-link" href="/stickers">get the pottle stickers for the chat →</Link>
          </>
        ) : (<>
        <div className="sheet-head">
          <div className="sheet-masc"><Mascot mood={sheetMood} level={pot.goal ? pot.raised / pot.goal : 0} track /></div>
          <h2 className="giant">you&apos;re in?</h2>
        </div>
        {signingIn ? (<>
          <p className="where">sign in to pay <b>{m(amount)}</b> into {pot.title}{name.trim() ? <> as <b>{name.trim().toLowerCase()}</b></> : null}. it carries on by itself once you&apos;re in.</p>
          <SignIn title="your email" />
          <button className="linkbtn" onClick={() => walletStore.cancel()}>back</button>
        </>) : (<>
        <input className="bigin" placeholder="your name" data-autofocus value={name} onChange={(e) => setName(fitBytes(e.target.value, MAX_NAME_BYTES))} onKeyDown={(e) => e.key === "Enter" && pay()} aria-label="your name" enterKeyHint="go" autoComplete="given-name" />
        <div className="chips" role="group" aria-label="amount">
          {picks.map((a) => <button key={a} className="chip" aria-pressed={!other && amount === a} onClick={() => { setPicked(a); setUserPicked(true); }}>{m(a)}</button>)}
          <button className="chip" aria-pressed={other} onClick={() => setPicked("other")}>other</button>
        </div>
        {other && (
          <label className="money typed">
            <span>{TOKEN[pot.currency].symbol}</span>
            <input className="bigin" inputMode="decimal" placeholder={String(Math.min(left || 10, room))} autoFocus value={typed} aria-label="amount"
              onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) setTyped(v); }}
              onKeyDown={(e) => e.key === "Enter" && pay()} enterKeyHint="go" />
          </label>
        )}
        <p className="where">
          {tooBig ? <>{room > 0 ? <>this pot can take at most <b>{m(room)}</b> more.</> : <>this pot is full now.</>}</>
            : tooSmall ? <>at least {m(MIN_CHIP)}, please.</>
            : amount > 0 && amount === left ? <>that&apos;s exactly what&apos;s left. it hits the goal and goes to <b>{pot.organiserName}</b>.</>
            : amount > left && left > 0 ? <>that&apos;s {m(Math.round((amount - left) * 100) / 100)} over the goal. the extra goes to <b>{pot.organiserName}</b> too.</>
            : w.address && w.address.toLowerCase() === pot.organiser.toLowerCase()
            ? <>this is your pot. your {m(amount)} comes back to you with the rest if it hits {m(pot.goal)}.</>
            : <>{m(left)} to go. it goes to <b>{pot.organiserName}</b> if the pot hits {m(pot.goal)}, back to you if it doesn&apos;t.</>}
        </p>
        {!w.address && (
          <p className="hint" style={{ margin: 0 }}>you pay in digital {pot.currency === "eur" ? "euros (eurc)" : "dollars (usdc)"}. sign in with your email and pottle sets it up, no app needed.</p>
        )}
        <button className="btn lg wide" onClick={pay} disabled={!!busy || !w.on || !valid}>
          {busy === "pay" ? "paying…" : busy === "signin" ? (w.ready ? "signing in…" : "one sec…") : !valid ? "pick an amount" : w.address ? `pay ${m(amount)}` : `sign in to pay ${m(amount)}`}
        </button>
        </>)}
        <div className="err" role="alert">{open && err}</div>
        {open && have >= MIN_CHIP && !ONRAMP_ON && (
          <button className="btn sm ghost" onClick={() => { setPicked("other"); setTyped(String(have)); setErr(""); setShort(0); setHave(0); }}>chip in {m(have)} instead</button>
        )}
        {open && short > 0 && ONRAMP_ON && (
          <AddMoney currency={pot.currency} amount={short} label={`add ${m(short)} by card`} onDone={() => { setShort(0); setErr(""); }} />
        )}
        </>)}
      </Sheet>
    </main>
  );
}
