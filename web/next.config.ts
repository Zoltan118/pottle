import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pin the project root. a stray package-lock.json higher up the disk otherwise makes
  // next guess the wrong root and silently drop dynamic routes in dev
  turbopack: { root: __dirname },
};

export default nextConfig;
