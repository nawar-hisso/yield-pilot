/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@yield-pilot/shared", "@yield-pilot/contracts-abi"],
  experimental: {
    typedRoutes: true,
  },
  // Keep dev watchpack from walking the pnpm symlink farm — otherwise
  // macOS hits EMFILE and the app router loses sight of app/, serving
  // /_not-found for every route.
  webpack: (webpackConfig, { dev }) => {
    if (dev) {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**"],
      };
    }
    return webpackConfig;
  },
};

export default config;
