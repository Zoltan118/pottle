import { notFound } from "next/navigation";
import { MotionPreview } from "./MotionPreview";

// dev only: plays the moments that normally need a real payment or someone else chipping in
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MotionPreview />;
}
