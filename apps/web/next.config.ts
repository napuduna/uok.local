import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@warehouse/contracts", "@warehouse/ui"],
  rewrites() {
    const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
    return Promise.resolve([
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`
      }
    ]);
  }
};

export default nextConfig;
