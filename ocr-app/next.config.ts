import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone', // Required for Electron
  images: {
    unoptimized: true, // Disable image optimization for Electron
  },
  // Exclude dist folder from being copied to standalone build
  outputFileTracing: {
    ignoreDirs: ['dist', 'node_modules/.cache'],
  },
};

export default nextConfig;
