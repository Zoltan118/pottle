import { notFound } from "next/navigation";
import { HomeScreenTip } from "@/components/HomeScreenTip";

// dev only: the add-to-home-screen line as it appears after making a pot. open it with a phone
// user agent (or the browser's phone emulation) to see it; desktops are never offered it
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="view">
      <section className="flow">
        <h1 className="giant q">ready.</h1>
        <HomeScreenTip />
      </section>
    </main>
  );
}
