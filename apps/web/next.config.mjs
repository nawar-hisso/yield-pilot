/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@yield-pilot/shared", "@yield-pilot/contracts-abi"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
