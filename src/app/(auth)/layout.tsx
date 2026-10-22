import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center text-xl font-semibold text-indigo-700">
          Fidelización
        </Link>
        {children}
      </div>
    </main>
  );
}
