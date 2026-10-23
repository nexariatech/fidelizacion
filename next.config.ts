import type { NextConfig } from "next";

// En desarrollo se permite abrir la app desde túneles HTTPS (VS Code Ports,
// Cloudflare) para probar en el celular. En producción no se relaja nada.
// "**" porque las URLs de VS Code tienen dos niveles: xxx-3000.brs.devtunnels.ms
const devTunnels = ["**.devtunnels.ms", "*.trycloudflare.com"];
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  ...(isDev && {
    allowedDevOrigins: devTunnels,
    experimental: { serverActions: { allowedOrigins: devTunnels } },
  }),
};

export default nextConfig;
