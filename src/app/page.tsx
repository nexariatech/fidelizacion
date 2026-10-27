import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { getViewer } from "@/server/auth/session";

export default async function Home() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && (await getViewer())) redirect("/inicio");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold">Fidelización</h1>
        <p className="text-neutral-600">
          Una sola cuenta para sumar puntos y canjear recompensas en todos los comercios adheridos.
        </p>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/registro">Crear cuenta</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Iniciar sesión
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
