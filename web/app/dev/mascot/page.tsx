import { notFound } from "next/navigation";
import { MascotPreview } from "./MascotPreview";

// dev only: the mascot candidates, side by side, in every mood
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MascotPreview />;
}
