import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/server/auth/session";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
