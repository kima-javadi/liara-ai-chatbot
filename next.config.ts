import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small for Liara PaaS.
  output: "standalone",
  // A stray package-lock.json in the home directory otherwise gets picked up
  // as the workspace root.
  turbopack: { root: __dirname },
};

export default nextConfig;
