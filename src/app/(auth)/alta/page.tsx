import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { safeNextPath } from "@/lib/origin";
import { requireViewer } from "@/server/auth/session";
import { RegisterCustomerForm } from "./form";

// Alta del cliente: DNI obligatorio antes de poder sumar o canjear puntos.
export default async function CustomerRegistrationPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next ?? "/cliente");
  const viewer = await requireViewer();
  if (viewer.staff) redirect("/comercio");
  if (viewer.customer && viewer.customerHasDni) redirect(next);

  return (
    <Card title="Completa tu alta">
      <p className="mb-4 text-sm text-neutral-600">
        En la caja solo vas a decir tu DNI para sumar puntos. Lo pedimos una sola vez.
      </p>
      <RegisterCustomerForm next={next} defaultName={viewer.fullName} />
    </Card>
  );
}
