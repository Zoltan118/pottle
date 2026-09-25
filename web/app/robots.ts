import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";

// search engines and ai assistants are welcome; the api is not for crawling
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/", disallow: "/api/" },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
