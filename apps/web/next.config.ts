import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  transpilePackages: ["@shoppilot/domain"],
  rewrites() {
    const apiBaseUrl =
      process.env.API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:3001";
    return Promise.resolve([
      {
        source: "/.well-known/ucp",
        destination: `${apiBaseUrl}/.well-known/ucp`,
      },
      {
        source: "/openapi.json",
        destination: `${apiBaseUrl}/openapi.json`,
      },
      {
        source: "/v1/:path*",
        destination: `${apiBaseUrl}/v1/:path*`,
      },
    ]);
  },
};

export default config;
