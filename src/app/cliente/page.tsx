import Link from "next/link";
import QRCode from "qrcode";
import { rotateQrAction } from "@/app/actions/customer";
import { Card, Empty } from "@/components/ui";
import { requireViewer } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { customerOverview } from "@/server/services/queries";
import { ProfileBanner } from "./profile-banner";

export default async function CustomerHome({ searchParams }: { searchParams: Promise<{ comercio?: string }> }) {
  const { comercio } = await searchParams;
  const viewer = await requireViewer();
  const { customer, memberships } = await customerOverview(getDb(), viewer.customer.customerId);
  const qrSvg = await QRCode.toString(customer.qrToken, { type: "svg", margin: 1, width: 240 });

  return (
    <>
      {comercio === "no-encontrado" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Ese comercio no existe o su programa está pausado.
        </p>
      )}
      {!customer.profileComplete && <ProfileBanner />}
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <Card title="Mi QR">
          <div className="space-y-3 text-center">
            <div className="mx-auto w-60" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-sm text-neutral-600">Muéstralo en la caja para sumar puntos.</p>
            <p className="text-xs text-neutral-500">Este QR solo te identifica: no sirve para canjear puntos.</p>
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">Ver código del QR</summary>
              <code className="mt-1 block break-all select-all rounded bg-neutral-100 p-2">{customer.qrToken}</code>
            </details>
            <form action={rotateQrAction}>
              <button className="text-xs text-neutral-500 underline hover:text-neutral-800">
                Generar un QR nuevo (invalida el actual)
              </button>
            </form>
          </div>
        </Card>

        <Card title={`Hola, ${customer.fullName}`}>
          {memberships.length === 0 ? (
            <Empty>Todavía no sumaste puntos. Muestra tu QR en un comercio adherido.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {memberships.map((m) => (
                <li key={m.merchantId}>
                  <Link
                    href={`/cliente/${m.merchantId}`}
                    className="flex items-center justify-between py-3 hover:text-indigo-700"
                  >
                    <span>
                      <span className="block font-medium">{m.merchantName}</span>
                      <span className="text-xs text-neutral-500">{m.programName}</span>
                    </span>
                    <span className="text-lg font-semibold">{m.balance} pts</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
