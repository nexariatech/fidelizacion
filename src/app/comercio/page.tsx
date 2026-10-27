import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Card, Empty } from "@/components/ui";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { staffBranches } from "@/server/services/queries";

export default async function StaffHome() {
  const { staff } = await requireStaff();
  const branches = await staffBranches(getDb(), staff);
  const ownedMerchants = [...new Map(branches.filter((b) => b.isOwner).map((b) => [b.merchantId, b.merchantName]))];
  if (branches.length === 1 && ownedMerchants.length === 0) redirect(`/comercio/sucursal/${branches[0].branchId}`);

  return (
    <>
      <h1 className="text-2xl font-semibold">Comercio</h1>
      {ownedMerchants.length > 0 && (
        <Card title="Administrar">
          <div className="flex flex-wrap gap-2">
            {ownedMerchants.map(([id, name]) => (
              <ButtonLink key={id} href={`/comercio/${id}`} variant="secondary">
                {name}
              </ButtonLink>
            ))}
          </div>
        </Card>
      )}
      <Card title="Operar en una sucursal">
        {branches.length === 0 ? (
          <Empty>No tienes sucursales asignadas.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {branches.map((b) => (
              <li key={b.branchId}>
                <Link href={`/comercio/sucursal/${b.branchId}`} className="block py-3 hover:text-indigo-700">
                  <span className="font-medium">{b.branchName}</span>
                  <span className="text-sm text-neutral-500"> · {b.merchantName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
