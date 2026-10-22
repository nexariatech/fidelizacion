import type { DbOrTx } from "../db/client";
import { auditLog } from "../db/schema";

export async function audit(
  db: DbOrTx,
  entry: {
    merchantId: string | null;
    actorType: "staff" | "customer" | "system";
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    data?: Record<string, unknown>;
  },
) {
  await db.insert(auditLog).values({ ...entry, data: entry.data ?? null });
}
