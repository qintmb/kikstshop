import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['emdmfborgbzeuuywrnny.supabase.co'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'emdmfborgbzeuuywrnny.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
