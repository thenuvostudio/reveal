import type { NextConfig } from "next";

// Static export: the app is entirely client-side (data lives in the browser),
// so it builds to plain files in ./out that any static server can host.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
