import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone', // Required for Electron
  images: {
    unoptimized: true, // Disable image optimization for Electron
  },
};

export default nextConfig;
