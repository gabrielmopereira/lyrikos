import { execFileSync } from "node:child_process";

import type { NextConfig } from "next";

const resolveApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (process.env.NODE_ENV === "development") {
    try {
      const url = execFileSync("portless", ["get", "lyrikos.api"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (url.startsWith("http")) {
        return url;
      }
    } catch {
      // portless not installed or daemon not running — fall through
    }
  }

  return "http://localhost:4000";
};

const apiUrl = resolveApiUrl();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["lyrikos.web.localhost", "*.lyrikos.web.localhost", "*.vercel.app"],

  env: { NEXT_PUBLIC_API_URL: apiUrl },

  images: {
    remotePatterns: [new URL("https://cdn-images.dzcdn.net/**")],
  },

  reactStrictMode: true,

  serverExternalPackages: ["@prisma/client", "@repo/db"],

  transpilePackages: ["@repo/ui"],
};

export default nextConfig;
