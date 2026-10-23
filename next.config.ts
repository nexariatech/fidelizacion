import type { NextConfig } from "next";

// En desarrollo se permite abrir la app desde túneles HTTPS (VS Code Ports,
// Cloudflare) para probar en el celular. En producción no se relaja nada.
const devTunnels = ["*.devtunnels.ms", "*.trycloudflare.com"];
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  ...(isDev && {
    allowedDevOrigins: devTunnels,
    experimental: { serverActions: { allowedOrigins: devTunnels } },
  }),
};

export default nextConfig;
