import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.YACCOUNT_GITHUB_PAGES === "true";
const basePath = isGitHubPagesBuild ? "/yaccount" : "";

if (isGitHubPagesBuild && !process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
  throw new Error("GitHub Pages build requires NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID");
}

const nextConfig: NextConfig = {
  // Static export — compiles to plain HTML/JS/CSS (§2.2). This is what a
  // plain browser serves with no server and what Capacitor wraps (M10).
  output: "export",
  // Pages serves this repository below /yaccount. Keep the prefix opt-in so
  // local development, Playwright and the future Capacitor build stay at /.
  basePath,
  assetPrefix: basePath,
  // Emit route/index.html so Pages can hard-refresh extensionless deep links.
  trailingSlash: true,
  // Static export cannot use the default (server) Image Optimization.
  images: { unoptimized: true },
  // Fail the build on type errors — financial-integrity posture.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
