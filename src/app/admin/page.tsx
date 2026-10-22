import { createMerchantAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, Select } from "@/components/ui";
import { getDb } from "@/server/db/client";
import { listMerchants } from "@/server/services/queries";

export default async function AdminPage() {
  const merchants = await listMerchants(getDb());
  return (
    <>
      <h1 className="text-2xl font-semibold">Plataforma</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Comercios">
          {merchants.length === 0 ? (
            <Empty>Todavía no hay comercios.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {merchants.map((m) => (
                <li key={m.id} className="flex justify-between py-2">
                  <span>
                    {m.name} <span className="text-neutral-500">· {m.slug}</span>
                  </span>
                  <Badge tone={m.status === "active" ? "green" : "red"}>{m.status === "active" ? "activo" : "suspendido"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Alta de comercio">
          <ActionForm action={createMerchantAction} submitLabel="Crear comercio">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Identificador" hint="Minúsculas, números y guiones">
              <Input name="slug" pattern="[a-z0-9\-]{3,60}" required />
            </Field>
            <Field label="Primera sucursal">
              <Input name="branchName" defaultValue="Casa central" required />
            </Field>
            <Field label="Email del dueño" hint="Debe haberse registrado antes">
              <Input name="ownerEmail" type="email" required />
            </Field>
            <Field label="Nombre del programa">
              <Input name="programName" defaultValue="Club de puntos" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Puntos">
                <Input name="pointsPerUnit" type="number" min={1} defaultValue={1} required />
              </Field>
              <Field label="Por cada ($)">
                <Input name="unitAmount" inputMode="decimal" defaultValue="100" required />
              </Field>
            </div>
            <Field label="Calcular sobre">
              <Select name="accrualBase" defaultValue="total">
                <option value="total">Importe total</option>
                <option value="eligible">Importe elegible</option>
              </Select>
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
