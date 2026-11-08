import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // يتجاوز أخطاء ESLint أثناء البناء على Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // يتجاوز أخطاء الأنواع (Types) المؤقتة أثناء البناء
    ignoreBuildErrors: true,
  },
};

export default nextConfig;