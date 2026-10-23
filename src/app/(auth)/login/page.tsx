import Link from "next/link";
import { Card } from "@/components/ui";
import { safeNextPath } from "@/lib/origin";
import { getDb } from "@/server/db/client";
import { findJoinableMerchant } from "@/server/services/enrollment";
import { GoogleButton, MagicLinkForm, PasswordForm } from "./forms";

const errors: Record<string, string> = {
  google: "No se pudo iniciar sesión con Google. Intenta de nuevo.",
  link: "El link venció o ya se usó. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const joinSlug = next.match(/^\/unirse\/([^/?#]+)$/)?.[1];
  const merchant = joinSlug ? await findJoinableMerchant(getDb(), decodeURIComponent(joinSlug)) : null;

  return (
    <Card title={merchant ? `Únete a ${merchant.name}` : "Ingresar"}>
      <div className="space-y-5">
        {merchant && (
          <p className="text-sm text-neutral-600">
            Suma puntos en cada compra y canjéalos por recompensas. Sin contraseñas ni formularios.
          </p>
        )}
        {params.error && errors[params.error] && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[params.error]}</p>
        )}
        <GoogleButton next={next} />
        <MagicLinkForm next={next} />
        <details className="text-sm text-neutral-600">
          <summary className="cursor-pointer">Ingresar con contraseña (personal de comercios)</summary>
          <div className="mt-4">
            <PasswordForm next={next} />
          </div>
          <p className="mt-4 text-center">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-indigo-700">
              Regístrate
            </Link>
          </p>
        </details>
      </div>
    </Card>
  );
}
