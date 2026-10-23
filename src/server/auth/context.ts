import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { branches, customers, merchants, staffAssignments, staffUsers } from "../db/schema";
import { DomainError } from "../domain/errors";

export type StaffAssignment = {
  merchantId: string;
  branchId: string | null;
  role: "owner" | "employee";
};

export type StaffContext = {
  kind: "staff";
  staffUserId: string;
  isPlatformAdmin: boolean;
  assignments: StaffAssignment[];
};

export type CustomerContext = {
  kind: "customer";
  customerId: string;
};

// Se arma en el servidor a partir del usuario autenticado; nunca a partir de
// datos enviados por el navegador.
export async function loadStaffContext(db: DbOrTx, authUserId: string): Promise<StaffContext | null> {
  const rows = await db
    .select({
      id: staffUsers.id,
      isPlatformAdmin: staffUsers.isPlatformAdmin,
      merchantId: staffAssignments.merchantId,
      branchId: staffAssignments.branchId,
      role: staffAssignments.role,
    })
    .from(staffUsers)
    .leftJoin(staffAssignments, eq(staffAssignments.staffUserId, staffUsers.id))
    .where(eq(staffUsers.authUserId, authUserId));
  if (rows.length === 0) return null;
  const assignments = rows.flatMap((r) =>
    r.merchantId && r.role ? [{ merchantId: r.merchantId, branchId: r.branchId, role: r.role }] : [],
  );
  return { kind: "staff", staffUserId: rows[0].id, isPlatformAdmin: rows[0].isPlatformAdmin, assignments };
}

export async function loadCustomerContext(db: DbOrTx, authUserId: string): Promise<CustomerContext | null> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.authUserId, authUserId));
  return customer ? { kind: "customer", customerId: customer.id } : null;
}

export function isOwner(ctx: StaffContext, merchantId: string): boolean {
  return ctx.assignments.some((a) => a.role === "owner" && a.merchantId === merchantId);
}

export function canOperateBranch(ctx: StaffContext, merchantId: string, branchId: string): boolean {
  return ctx.assignments.some(
    (a) => a.merchantId === merchantId && (a.role === "owner" || a.branchId === branchId),
  );
}

// Devuelve la sucursal si el usuario puede operar en ella. Responde not_found
// (no forbidden) para no revelar que la sucursal existe en otro comercio.
export async function requireOperableBranch(db: DbOrTx, ctx: StaffContext, branchId: string) {
  const [row] = await db
    .select({ branch: branches, merchant: merchants })
    .from(branches)
    .innerJoin(merchants, eq(merchants.id, branches.merchantId))
    .where(eq(branches.id, branchId));
  if (!row || !row.branch.active || !canOperateBranch(ctx, row.branch.merchantId, branchId)) {
    throw new DomainError("not_found", "Sucursal no encontrada");
  }
  if (row.merchant.status !== "active") throw new DomainError("merchant_suspended");
  return row.branch;
}

export function requireOwner(ctx: StaffContext, merchantId: string) {
  if (!isOwner(ctx, merchantId)) throw new DomainError("not_found");
}
