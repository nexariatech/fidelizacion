import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fidelización",
    short_name: "Fidelización",
    description: "Tus puntos y recompensas en todos los comercios",
    start_url: "/cliente",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#4f46e5",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
