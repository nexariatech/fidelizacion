import { notFound } from "next/navigation";
import {
  assignEmployeeAction,
  cancelRedemptionAction,
  createBranchAction,
  createRewardAction,
  toggleRewardAction,
  updateProgramAction,
  voidPurchaseAction,
} from "@/app/actions/staff";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, Select } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { DomainError } from "@/server/domain/errors";
import { ownerDashboard } from "@/server/services/queries";

export default async function OwnerPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const { staff } = await requireStaff();
  const d = await ownerDashboard(getDb(), staff, merchantId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const hidden = <input type="hidden" name="merchantId" value={merchantId} />;

  return (
    <>
      <h1 className="text-2xl font-semibold">{d.merchant.name}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Clientes únicos", d.stats.customers],
          ["Compras", d.stats.purchases],
          ["Puntos otorgados", d.stats.pointsAwarded],
          ["Canjes", d.stats.redemptions],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Programa de puntos">
          <ActionForm action={updateProgramAction} submitLabel="Guardar">
            {hidden}
            <Field label="Nombre">
              <Input name="name" defaultValue={d.program.name} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Puntos">
                <Input name="pointsPerUnit" type="number" min={1} defaultValue={d.program.pointsPerUnit} required />
              </Field>
              <Field label="Por cada ($)">
                <Input name="unitAmount" inputMode="decimal" defaultValue={String(d.program.unitAmountCents / 100)} required />
              </Field>
            </div>
            <Field label="Calcular sobre">
              <Select name="accrualBase" defaultValue={d.program.accrualBase}>
                <option value="total">Importe total de la compra</option>
                <option value="eligible">Importe elegible que informa el empleado</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={d.program.active} /> Programa activo
            </label>
          </ActionForm>
        </Card>

        <Card title="Recompensas">
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {d.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {r.name} · {r.pointsCost} pts {!r.active && <Badge>inactiva</Badge>}
                </span>
                <form action={toggleRewardAction}>
                  {hidden}
                  <input type="hidden" name="rewardId" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <button className="text-xs text-indigo-700 underline">{r.active ? "Desactivar" : "Activar"}</button>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={createRewardAction} submitLabel="Agregar recompensa" variant="secondary">
            {hidden}
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Input name="name" placeholder="Nombre" required />
              <Input name="pointsCost" type="number" min={1} placeholder="Puntos" required />
            </div>
            <Input name="description" placeholder="Descripción (opcional)" />
          </ActionForm>
        </Card>

        <Card title="Sucursales">
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {d.branches.map((b) => (
              <li key={b.id} className="py-2">
                {b.name} {b.address && <span className="text-neutral-500">· {b.address}</span>}
              </li>
            ))}
          </ul>
          <ActionForm action={createBranchAction} submitLabel="Agregar sucursal" variant="secondary">
            {hidden}
            <Input name="name" placeholder="Nombre" required />
            <Input name="address" placeholder="Dirección (opcional)" />
          </ActionForm>
        </Card>

        <Card title="Personal">
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {d.staff.map((s, i) => (
              <li key={i} className="py-2">
                {s.email} · {s.role === "owner" ? "Dueño" : `Empleado en ${s.branchName}`}
              </li>
            ))}
          </ul>
          <ActionForm action={assignEmployeeAction} submitLabel="Asignar empleado" variant="secondary">
            {hidden}
            <Input name="email" type="email" placeholder="Email (debe estar registrado)" required />
            <Select name="branchId" required>
              {d.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </ActionForm>
        </Card>
      </div>

      <Card title="Compras recientes">
        {d.purchases.length === 0 ? (
          <Empty>Sin compras.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {d.purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatDate(p.createdAt)} · {p.branchName} · {p.customerName} · {formatMoney(p.amountCents)} · +
                  {p.points} pts
                </span>
                {p.status === "voided" ? (
                  <Badge tone="red">anulada: {p.voidReason}</Badge>
                ) : (
                  <ActionForm action={voidPurchaseAction} submitLabel="Anular" variant="danger" className="flex gap-2">
                    {hidden}
                    <input type="hidden" name="purchaseId" value={p.id} />
                    <Input name="reason" placeholder="Motivo" required minLength={3} className="w-40" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Canjes recientes">
        {d.redemptions.length === 0 ? (
          <Empty>Sin canjes.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {d.redemptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatDate(r.createdAt)} · {r.branchName} · {r.customerName} · {r.rewardName} · −{r.points} pts
                </span>
                {r.status === "cancelled" ? (
                  <Badge tone="red">cancelado</Badge>
                ) : (
                  <ActionForm action={cancelRedemptionAction} submitLabel="Cancelar" variant="danger" className="flex gap-2">
                    {hidden}
                    <input type="hidden" name="redemptionId" value={r.id} />
                    <Input name="reason" placeholder="Motivo" required minLength={3} className="w-40" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
