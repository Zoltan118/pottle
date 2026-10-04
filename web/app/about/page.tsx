import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { explorerAddress, POTTLE, REPO } from "@/lib/config";
import { MAX_POT } from "@/lib/pot";

export const metadata: Metadata = {
  title: "about · pottle",
  description: "how pottle works on chain, what it stores, what it can and can't do with your money, and the risks during beta.",
};

// how pottle works, what it keeps, the terms in plain words. kept short and true: everything here can be
// checked against the open source code and the contract
export default function About() {
  return (
    <main className="view">
      <Nav />
      <article className="shell about">
        <h1 className="giant">about.</h1>

        <section>
          <h2>pottle never holds your money</h2>
          <p>pottle is open source software, built for circle&apos;s arc microgrants. it charges no fees, and the money never passes through it: every pot lives in one public contract on arc with no owner and no admin. it pays a pot to its organiser when the goal is hit, and back to everyone who paid when the deadline passes without it. nobody can change that, take money early, or send it anywhere else: not the organiser, and not pottle.</p>
          {POTTLE && <p>the contract: <a href={explorerAddress(POTTLE)} target="_blank" rel="noreferrer">{POTTLE.slice(0, 6)}…{POTTLE.slice(-4)} on the arc explorer</a>.</p>}
        </section>

        <section>
          <h2>beta</h2>
          <p>pottle hasn&apos;t had a third-party audit yet, so the contract caps every pot at ${MAX_POT.toLocaleString("en-US")} or €{MAX_POT.toLocaleString("en-US")}. use it for amounts you&apos;re fine with. what was checked and what&apos;s known is in the <a href={`${REPO}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">security review</a>.</p>
        </section>

        <section>
          <h2>what&apos;s stored, and where</h2>
          <ul>
            <li><b>on the blockchain, for good and readable by anyone:</b> pot titles, the names people type, amounts and wallet addresses. a name can&apos;t be changed or deleted later, so use one you&apos;re happy to have public.</li>
            <li><b>with dynamic</b> (sign-in): your email, your passkey if you add one, and your wallet, which dynamic keeps so only you can use it.</li>
            <li><b>with circle</b>, only if you buy usdc by card: what their id check asks for.</li>
            <li><b>with vercel</b> (hosting): ordinary request logs, kept briefly.</li>
            <li><b>with google analytics</b>: which pages are visited, counted without cookies and without any ad features.</li>
            <li><b>pottle itself</b> keeps no accounts and no database.</li>
          </ul>
        </section>

        <section>
          <h2>the risks</h2>
          <ul>
            <li>payments on a blockchain are final. money sent to a wrong address can&apos;t be brought back.</li>
            <li>your wallet is tied to your email. whoever gets into your email can sign in as you, so keep it safe.</li>
            <li>usdc and eurc are issued by circle, which can freeze an address or pause the token.</li>
            <li>if pottle&apos;s website ever goes away, your money doesn&apos;t: the contract keeps working, and anyone can pay out or refund a due pot from the arc explorer.</li>
          </ul>
        </section>

        <section>
          <h2>the terms, in short</h2>
          <p>pottle is free and provided as is, with no warranty. you decide what you send and to whom, and you&apos;re responsible for it. using pottle means you accept that.</p>
        </section>

        <section>
          <h2>contact</h2>
          <p>questions and ideas: <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">open an issue on github</a>. found a security problem? please <a href={`${REPO}/security/advisories/new`} target="_blank" rel="noreferrer">report it privately</a>.</p>
        </section>

        <Link className="btn lg ghost" href="/new">make a pot</Link>
      </article>
    </main>
  );
}
