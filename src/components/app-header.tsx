import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import type { Viewer } from "@/server/auth/session";

export function AppHeader({ viewer }: { viewer: Viewer }) {
  const isStaff = (viewer.staff?.assignments.length ?? 0) > 0;
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/inicio" className="font-semibold text-indigo-700">
          Fidelización
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/cliente" className="text-neutral-700 hover:text-indigo-700">
            Mis puntos
          </Link>
          {isStaff && (
            <Link href="/comercio" className="text-neutral-700 hover:text-indigo-700">
              Comercio
            </Link>
          )}
          {viewer.staff?.isPlatformAdmin && (
            <Link href="/admin" className="text-neutral-700 hover:text-indigo-700">
              Plataforma
            </Link>
          )}
          <form action={signOut}>
            <button className="text-neutral-500 hover:text-neutral-900">Salir</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
