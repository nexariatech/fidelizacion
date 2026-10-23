import { notFound } from "next/navigation";
import { Badge, Card, Empty } from "@/components/ui";
import { formatDate, movementLabels } from "@/lib/format";
import { requireViewer } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { DomainError } from "@/server/domain/errors";
import { customerMerchantDetail } from "@/server/services/queries";
import { isGoogleWalletEnabled } from "@/server/services/wallet";
import { GoogleWalletButton } from "./google-wallet-button";
import { RedeemReward } from "./redeem-reward";

export default async function CustomerMerchantPage({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const viewer = await requireViewer();
  const detail = await customerMerchantDetail(getDb(), viewer.customer.customerId, merchantId).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{detail.merchant.name}</h1>
          <p className="text-sm text-neutral-500">{detail.program.name}</p>
        </div>
        <p className="text-3xl font-bold text-indigo-700">{detail.balance} pts</p>
      </div>

      {isGoogleWalletEnabled() && <GoogleWalletButton merchantId={merchantId} />}

      <Card title="Recompensas">
        {detail.rewards.length === 0 ? (
          <Empty>Este comercio todavía no tiene recompensas.</Empty>
        ) : (
          <ul className="space-y-3">
            {detail.rewards.map((r) => (
              <li key={r.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    {r.description && <p className="text-sm text-neutral-500">{r.description}</p>}
                  </div>
                  <Badge tone={detail.balance >= r.pointsCost ? "green" : "neutral"}>{r.pointsCost} pts</Badge>
                </div>
                {detail.balance >= r.pointsCost && detail.program.active && (
                  <RedeemReward rewardId={r.id} branches={detail.branches} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Movimientos">
        {detail.movements.length === 0 ? (
          <Empty>Sin movimientos.</Empty>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {detail.movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 text-neutral-500">{formatDate(m.createdAt)}</td>
                  <td className="py-2">
                    {movementLabels[m.type]} · {m.branchName}
                  </td>
                  <td className={`py-2 text-right font-medium ${m.points > 0 ? "text-green-700" : "text-red-700"}`}>
                    {m.points > 0 ? "+" : ""}
                    {m.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
