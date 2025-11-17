import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone', // Required for Electron
  images: {
    unoptimized: true, // Disable image optimization for Electron
  },
  // Note: dist folder is cleaned before build via npm run clean script
};

export default nextConfig;
