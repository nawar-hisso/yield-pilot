import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@yield-pilot/shared", "@yield-pilot/contracts-abi"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
