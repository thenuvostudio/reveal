import type { NextConfig } from "next";

// Static export: the app is entirely client-side (data lives in the browser),
// so it builds to plain files in ./out that any static server can host.
//
// BASE_PATH is set only when the app is served from a sub-path, e.g. GitHub
// Pages at https://<owner>.github.io/reveal → BASE_PATH=/reveal. Left unset,
// the app is served from the domain root (local dev, Vercel, Render, …).
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  basePath,
};

export default nextConfig;
