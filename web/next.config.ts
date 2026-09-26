import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sql.js loads its .wasm from node_modules at runtime; keep it out of the server bundle.
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
