import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HeroPot } from "@/components/HeroPot";
import { BigMark, Logo } from "@/components/Mark";
import { explorerAddress, NETWORK, OTHER_SITE, POTTLE, REPO } from "@/lib/config";

const ONRAMP = !!process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL;

const FEATURES = [
  { word: "auto refund", line: "deadline missed? everyone's paid back, nobody has to ask.", wrap: "w-waves" },
  { word: "€ too", line: "euro pots in eurc, for friends who think in euros.", wrap: "w-stars" },
  { word: "nudge", line: "one tap sends the group a reminder with the link.", wrap: "w-stripes" },
  { word: "qr", line: "for the office leaving gift. scan, chip in, done.", wrap: "w-gingham" },
  { word: "thank you", line: "a card with everyone's names when it pays out.", wrap: "w-hearts" },
  ONRAMP
    ? { word: "by card", line: "no usdc yet? add it by card, apple pay or google pay.", wrap: "w-sprinkles" }
    : { word: "email in", line: "friends sign in with their email. no wallet app needed.", wrap: "w-sprinkles" },
];

const FAQ = [
  { q: "what does it cost?", a: "nothing from us, there are no fees. each payment has an arc network fee of about a tenth of a cent, and pottle usually pays it for you." },
  { q: "what if the goal isn't hit?", a: "when the deadline passes, everyone gets back exactly what they put in. it happens automatically, nobody has to ask." },
  { q: "who gets the money?", a: "the person who made the pot, the organiser. they're the one buying the gift or paying the bill, so every pot shows who it goes to before you chip in. if the goal isn't hit, nobody gets it and everyone is refunded." },
  { q: "can the organiser chip in too?", a: "yes, and it counts toward the goal like anyone's. their share comes back to them with the rest when the pot pays out, so they've paid their part like everyone else. the organiser's circle has a ring, so you can see what they put in." },
  { q: "what if the goal is hit but the money can't be paid out?", a: "it's paid out automatically, usually within minutes. if something blocks the payout for 30 days after the deadline (for example the organiser's account gets frozen), everyone can take their money back." },
  { q: "can the organiser take the money early?", a: "no. the money sits in a contract with no owner and no admin. it only goes to the organiser once the goal is hit. not even we can move it." },
  { q: "do my friends need crypto?", a: `no. they sign in with their email and get a wallet. they need usdc (or eurc for euro pots) on arc${ONRAMP ? ", which they can add by card inside pottle" : ""}.` },
  ...(ONRAMP ? [{ q: "can i pay by card?", a: "yes. if you don't have usdc yet, tap add money and buy it by card, apple pay or google pay, without leaving pottle. it's circle's onramp, so circle checks your id and the usdc lands straight in your own wallet." }] : []),
  { q: "what are usdc and eurc?", a: "digital dollars and euros issued by circle. one usdc is always worth one dollar, one eurc one euro." },
  { q: "what is arc?", a: "circle's blockchain for money. payments land in about half a second and fees are paid in usdc, so there's nothing else to buy first." },
  { q: "is it safe?", a: "the contract is open source and tested, and it can only send money to the organiser or back to whoever paid. there's been no third-party audit yet, so during beta a pot on the live site holds at most $100 (or €100)." },
];

export default function Home() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <main className="view">
      <Nav action={<Link className="btn sm hide-sm" href="/new">make a pot</Link>} />
      <section className="shell hero">
        <div>
          <h1 className="giant">chip in.<span className="pink">or get it back.</span></h1>
          <div className="hero-actions">
            <Link className="btn lg" href="/new">make a pot</Link>
            {NETWORK === "mainnet" && OTHER_SITE && <a className="btn lg ghost" href={OTHER_SITE}>try it free</a>}
          </div>
        </div>
        <HeroPot />
      </section>

      <section className="shell lines" aria-label="how it works">
        <div className="line"><span className="giant">1 pot.</span><button className="tipdot" data-tip="set a goal and a deadline. takes 20 seconds." aria-label="about the pot">?</button></div>
        <div className="line"><span className="giant">1 link.</span><button className="tipdot" data-tip="paste it in the group chat. friends sign in with email and chip in." aria-label="about the link">?</button></div>
        <div className="line"><span className="giant">0 chasing.</span><button className="tipdot" data-tip="goal missed? everyone gets their money back, automatically." aria-label="about refunds">?</button></div>
      </section>

      <section className="shell safe" aria-label="why it's safe">
        <h2 className="giant">nobody can take it early.</h2>
        <p className="safe-sub">not the organiser. not us.</p>
        <div className="safe-row">
          {POTTLE && <a className="chip" href={explorerAddress(POTTLE)} target="_blank" rel="noreferrer" data-tip="the contract holds every pot. it has no owner and no admin.">no owner ↗</a>}
          <span className="chip" tabIndex={0} data-tip="pottle takes nothing. you only pay arc's network fee, about a tenth of a cent, and usually not even that.">no fees</span>
          <a className="chip" href={REPO} target="_blank" rel="noreferrer" data-tip="every line is public on github.">open source ↗</a>
        </div>
      </section>

      <section className="shell feats" aria-label="features">
        {FEATURES.map((f) => (
          <div key={f.word} className={`feat ${f.wrap}`}>
            <div className="feat-in">
              <span className="feat-word">{f.word}</span>
              <span className="feat-line">{f.line}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="shell faq" aria-label="questions">
        <h2 className="giant">questions.</h2>
        <div className="faq-list">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </section>

      <section className="shell endcta">
        <h2 className="giant">who&apos;s in?</h2>
        <Link className="btn lg" href="/new">make a pot</Link>
      </section>

      <footer className="shell foot">
        <div className="foot-brand">
          <Logo />
          <span className="foot-tag">chip in, or get it back.</span>
        </div>
        <nav className="foot-links" aria-label="links">
          {OTHER_SITE && <a href={OTHER_SITE}>{NETWORK === "mainnet" ? "try it free" : "go live"}<span aria-hidden="true">↗</span></a>}
          <a href={REPO} target="_blank" rel="noreferrer">github<span aria-hidden="true">↗</span></a>
          {POTTLE && <a href={explorerAddress(POTTLE)} target="_blank" rel="noreferrer">contract<span aria-hidden="true">↗</span></a>}
        </nav>
        {NETWORK === "mainnet" && <p className="foot-note">beta · no third-party audit</p>}
      </footer>
      <BigMark />
    </main>
  );
}
