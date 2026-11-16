import Link from "next/link";
import { Card } from "@/components/ui";
import { GoogleButton, MagicLinkForm } from "../login/forms";

// Alta de clientes. El personal de comercios se registra en /registro/comercio.
export default function SignUpPage() {
  return (
    <Card title="Crear cuenta">
      <div className="space-y-5">
        <p className="text-sm text-neutral-600">
          Después te pedimos tu DNI: es lo único que vas a decir en la caja para sumar puntos.
        </p>
        <GoogleButton next="/alta" />
        <MagicLinkForm next="/alta" />
        <p className="text-center text-sm text-neutral-600">
          ¿Tienes un comercio o trabajas en uno?{" "}
          <Link href="/registro/comercio" className="font-medium text-indigo-700">
            Regístrate como comercio
          </Link>
        </p>
      </div>
    </Card>
  );
}
