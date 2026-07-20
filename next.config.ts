import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export — compiles to plain HTML/JS/CSS (§2.2). This is what a
  // plain browser serves with no server and what Capacitor wraps (M10).
  output: "export",
  // Static export cannot use the default (server) Image Optimization.
  images: { unoptimized: true },
  // Fail the build on type errors — financial-integrity posture.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
