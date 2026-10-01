import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";

// only the public pages. individual pots are shared by link, not listed
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/new`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/stickers`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
