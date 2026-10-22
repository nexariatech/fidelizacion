import { notFound } from "next/navigation";
import { Badge, Card, Empty } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { DomainError } from "@/server/domain/errors";
import { branchActivity } from "@/server/services/queries";
import { PurchaseForm, RedeemForm } from "./forms";

export default async function BranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const { staff } = await requireStaff();
  const activity = await branchActivity(getDb(), staff, branchId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{activity.branch.name}</h1>
        <p className="text-sm text-neutral-500">{activity.merchant.name}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Registrar compra">
          <PurchaseForm branchId={branchId} askEligible={activity.accrualBase === "eligible"} />
        </Card>
        <Card title="Canjear recompensa">
          <RedeemForm branchId={branchId} />
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Últimas compras">
          {activity.recentPurchases.length === 0 ? (
            <Empty>Sin compras todavía.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {activity.recentPurchases.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {p.customerName}
                    <span className="block text-xs text-neutral-500">{formatDate(p.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    {formatMoney(p.amountCents)} · +{p.points}
                    {p.status === "voided" && (
                      <span className="ml-1">
                        <Badge tone="red">anulada</Badge>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Últimos canjes">
          {activity.recentRedemptions.length === 0 ? (
            <Empty>Sin canjes todavía.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {activity.recentRedemptions.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {r.customerName} · {r.rewardName}
                    <span className="block text-xs text-neutral-500">{formatDate(r.createdAt)}</span>
                  </span>
                  <span>
                    −{r.points}
                    {r.status === "cancelled" && (
                      <span className="ml-1">
                        <Badge tone="red">cancelado</Badge>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
