import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/server/auth/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
