import "server-only";
import { headers } from "next/headers";

// URL pública de la request actual. Detrás de un túnel (VS Code, Cloudflare) o
// de Vercel, el host real llega en x-forwarded-host.
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Solo rutas internas, para que nadie use el login como redirección a otro sitio.
export function safeNextPath(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";
}
