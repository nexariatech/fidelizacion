import { AppShell } from "@/components/app-shell";
import { requirePlatformAdmin } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePlatformAdmin();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
