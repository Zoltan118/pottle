import Link from "next/link";
import { Mascot } from "@/components/Mascot";

// a wrong or old pot link: the mascot is as lost as you are, and there is a way on
export default function NotFound() {
  return (
    <main className="view">
      <section className="flow">
        <div className="lost-mascot"><Mascot mood="confused" level={0.4} /></div>
        <h1 className="giant q">no pot here.</h1>
        <p className="hint" style={{ margin: 0 }}>the link may be old or mistyped. ask the group for it again, or make your own.</p>
        <div className="ready-acts">
          <Link className="btn lg" href="/new">make a pot</Link>
          <Link className="btn lg ghost" href="/">pottle home</Link>
        </div>
      </section>
    </main>
  );
}
