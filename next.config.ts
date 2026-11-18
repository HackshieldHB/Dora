import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "exceljs", "pdf-lib"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
      allowedOrigins: ["localhost:3010", "localhost:3011", "*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
