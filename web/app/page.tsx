import Link from "next/link";
import { Nav } from "@/components/Nav";
import { HeroPot } from "@/components/HeroPot";

export default function Home() {
  return (
    <main className="view">
      <Nav action={<Link className="btn sm hide-sm" href="/new">make a pot</Link>} />
      <section className="shell hero">
        <div>
          <h1 className="giant">chip in.<span className="pink">or get it back.</span></h1>
          <div className="hero-actions">
            <Link className="btn lg" href="/new">make a pot</Link>
          </div>
        </div>
        <HeroPot />
      </section>
      <section className="shell lines" aria-label="how it works">
        <div className="line"><span className="giant">1 pot.</span><button className="tipdot" data-tip="set a goal and a deadline. takes 20 seconds." aria-label="about the pot">?</button></div>
        <div className="line"><span className="giant">1 link.</span><button className="tipdot" data-tip="paste it in the group chat. friends sign in with email and pay in usdc." aria-label="about the link">?</button></div>
        <div className="line"><span className="giant">0 chasing.</span><button className="tipdot" data-tip="goal missed? everyone gets their money back, automatically." aria-label="about refunds">?</button></div>
      </section>
      <footer className="shell foot">
        <span>pottle</span>
        <button className="tipword" data-tip="payments land in half a second and cost about a tenth of a cent. nobody can take a pot early, not even us.">usdc on arc</button>
      </footer>
    </main>
  );
}
