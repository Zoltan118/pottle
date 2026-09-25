import type { MetadataRoute } from "next";
import { NETWORK } from "@/lib/config";

/** add to home screen: the pot mark as the icon, opens full screen like an app */
export default function manifest(): MetadataRoute.Manifest {
  const test = NETWORK !== "mainnet";
  return {
    name: test ? "pottle (test)" : "pottle",
    short_name: test ? "pottle test" : "pottle",
    description: "a pot for the group chat. chip in, or get it back.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F3FA",
    theme_color: "#F6F3FA",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
