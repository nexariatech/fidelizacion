import { AppShell } from "@/components/app-shell";
import { requireCustomer } from "@/server/auth/session";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireCustomer();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
