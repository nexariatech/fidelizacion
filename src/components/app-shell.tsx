import type { ReactNode } from "react";
import type { Viewer } from "@/server/auth/session";
import { AppHeader } from "./app-header";

export function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return (
    <>
      <AppHeader viewer={viewer} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
