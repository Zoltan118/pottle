import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin the project root. a stray package-lock.json higher up the disk otherwise makes
  // next guess the wrong root and silently drop dynamic routes in dev
  turbopack: { root: __dirname },
  // each deploy's version, baked into the app. vercel sets the commit; locally it is "local", which
  // never asks anyone to update. /api/version reports the live one, and the app compares the two
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
  // pottle is never embedded in another site (stops clickjacking the pay button), and browsers
  // are told not to guess content types or leak full urls to other sites
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
