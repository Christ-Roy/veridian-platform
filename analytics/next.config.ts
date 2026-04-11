import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // POC dev : on sert l'app sur http://100.92.215.42:3100 (Tailscale dev-server)
  // et on l'ouvre depuis le laptop local. Next exige explicitement ces origins
  // pour les assets /_next/* en dev.
  allowedDevOrigins: ['100.92.215.42', 'dev-server-1'],
};

export default nextConfig;
