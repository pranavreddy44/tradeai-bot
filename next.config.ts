import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['crypto', 'telegram', 'sharp', 'z-ai-web-dev-sdk'],
  devIndicators: false,
  // Reduce dev server overhead
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion', '@radix-ui/react-icons'],
  },
};

export default nextConfig;
