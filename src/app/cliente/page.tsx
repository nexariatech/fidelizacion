import Link from "next/link";
import { Card, Empty } from "@/components/ui";
import { requireCustomer } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { customerOverview } from "@/server/services/queries";
import { ProfileBanner } from "./profile-banner";
import { formatDni } from "@/server/domain/dni";

export default async function CustomerHome({ searchParams }: { searchParams: Promise<{ comercio?: string }> }) {
  const { comercio } = await searchParams;
  const viewer = await requireCustomer();
  const { customer, memberships } = await customerOverview(getDb(), viewer.customer.customerId);

  return (
    <>
      {comercio === "no-encontrado" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Ese comercio no existe o su programa está pausado.
        </p>
      )}
      {!customer.profileComplete && <ProfileBanner />}
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <Card title="Para sumar puntos">
          <div className="space-y-3 text-center">
            <p className="text-sm text-neutral-600">Dile tu DNI en la caja:</p>
            <p className="font-mono text-3xl font-bold tracking-wider text-indigo-800">{customer.dni ? formatDni(customer.dni) : "—"}</p>
            <p className="text-xs text-neutral-500">
              Para canjear, entra al comercio y genera el código de la recompensa: solo vale en ese comercio.
            </p>
          </div>
        </Card>

        <Card title={`Hola, ${customer.fullName}`}>
          {memberships.length === 0 ? (
            <Empty>Todavía no sumaste puntos. Di tu DNI en la caja de un comercio adherido.</Empty>
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
