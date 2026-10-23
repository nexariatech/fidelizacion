import { and, count, countDistinct, desc, eq, inArray, sum } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import {
  branches,
  customers,
  loyaltyPrograms,
  merchants,
  pointMovements,
  programMemberships,
  purchases,
  redemptions,
  rewards,
  staffAssignments,
  staffUsers,
} from "../db/schema";
import { canOperateBranch, requireOwner, type StaffContext } from "../auth/context";
import { DomainError } from "../domain/errors";

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export async function customerOverview(db: DbOrTx, customerId: string) {
  const [customer] = await db
    .select({ fullName: customers.fullName, qrToken: customers.qrToken })
    .from(customers)
    .where(eq(customers.id, customerId));
  const memberships = await db
    .select({
      merchantId: merchants.id,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      balance: programMemberships.balance,
    })
    .from(programMemberships)
    .innerJoin(merchants, eq(merchants.id, programMemberships.merchantId))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, programMemberships.programId))
    .where(eq(programMemberships.customerId, customerId))
    .orderBy(merchants.name);
  return { customer, memberships };
}

// Detalle del cliente en un comercio. Solo devuelve datos si tiene membresía.
export async function customerMerchantDetail(db: DbOrTx, customerId: string, merchantId: string) {
  const [row] = await db
    .select({ membership: programMemberships, merchant: merchants, program: loyaltyPrograms })
    .from(programMemberships)
    .innerJoin(merchants, eq(merchants.id, programMemberships.merchantId))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, programMemberships.programId))
    .where(and(eq(programMemberships.customerId, customerId), eq(programMemberships.merchantId, merchantId)));
  if (!row) throw new DomainError("not_found");

  const [rewardList, branchList, movements] = await Promise.all([
    db
      .select()
      .from(rewards)
      .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true)))
      .orderBy(rewards.pointsCost),
    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(and(eq(branches.merchantId, merchantId), eq(branches.active, true)))
      .orderBy(branches.name),
    db
      .select({
        id: pointMovements.id,
        type: pointMovements.type,
        points: pointMovements.points,
        balanceAfter: pointMovements.balanceAfter,
        branchName: branches.name,
        createdAt: pointMovements.createdAt,
      })
      .from(pointMovements)
      .innerJoin(branches, eq(branches.id, pointMovements.branchId))
      .where(eq(pointMovements.membershipId, row.membership.id))
      .orderBy(desc(pointMovements.createdAt))
      .limit(30),
  ]);

  return {
    merchant: { id: row.merchant.id, name: row.merchant.name, status: row.merchant.status },
    program: { name: row.program.name, active: row.program.active },
    membershipId: row.membership.id,
    balance: row.membership.balance,
    rewards: rewardList,
    branches: branchList,
    movements,
  };
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export async function staffBranches(db: DbOrTx, ctx: StaffContext) {
  const merchantIds = [...new Set(ctx.assignments.map((a) => a.merchantId))];
  if (merchantIds.length === 0) return [];
  const rows = await db
    .select({
      branchId: branches.id,
      branchName: branches.name,
      merchantId: merchants.id,
      merchantName: merchants.name,
    })
    .from(branches)
    .innerJoin(merchants, eq(merchants.id, branches.merchantId))
    .where(and(inArray(branches.merchantId, merchantIds), eq(branches.active, true)))
    .orderBy(merchants.name, branches.name);
  return rows
    .filter((r) => canOperateBranch(ctx, r.merchantId, r.branchId))
    .map((r) => ({ ...r, isOwner: ctx.assignments.some((a) => a.role === "owner" && a.merchantId === r.merchantId) }));
}

export async function branchActivity(db: DbOrTx, ctx: StaffContext, branchId: string) {
  const [branch] = await db
    .select({ branch: branches, merchant: merchants, program: loyaltyPrograms })
    .from(branches)
    .innerJoin(merchants, eq(merchants.id, branches.merchantId))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, branches.merchantId))
    .where(eq(branches.id, branchId));
  if (!branch || !canOperateBranch(ctx, branch.branch.merchantId, branchId)) throw new DomainError("not_found");

  const [recentPurchases, recentRedemptions] = await Promise.all([
    db
      .select({
        id: purchases.id,
        customerName: customers.fullName,
        amountCents: purchases.amountCents,
        points: purchases.pointsAwarded,
        status: purchases.status,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .innerJoin(customers, eq(customers.id, purchases.customerId))
      .where(eq(purchases.branchId, branchId))
      .orderBy(desc(purchases.createdAt))
      .limit(10),
    db
      .select({
        id: redemptions.id,
        customerName: customers.fullName,
        rewardName: rewards.name,
        points: redemptions.pointsSpent,
        status: redemptions.status,
        createdAt: redemptions.createdAt,
      })
      .from(redemptions)
      .innerJoin(customers, eq(customers.id, redemptions.customerId))
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .where(eq(redemptions.branchId, branchId))
      .orderBy(desc(redemptions.createdAt))
      .limit(10),
  ]);

  return {
    branch: { id: branch.branch.id, name: branch.branch.name },
    merchant: { id: branch.merchant.id, name: branch.merchant.name },
    accrualBase: branch.program.accrualBase,
    recentPurchases,
    recentRedemptions,
  };
}

// ---------------------------------------------------------------------------
// Dueño
// ---------------------------------------------------------------------------

export async function ownerDashboard(db: DbOrTx, ctx: StaffContext, merchantId: string) {
  requireOwner(ctx, merchantId);

  const [[merchant], [program], branchList, rewardList, staffList, purchaseList, redemptionList, [stats], [redeemStats]] =
    await Promise.all([
      db.select().from(merchants).where(eq(merchants.id, merchantId)),
      db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)),
      db.select().from(branches).where(eq(branches.merchantId, merchantId)).orderBy(branches.name),
      db.select().from(rewards).where(eq(rewards.merchantId, merchantId)).orderBy(rewards.pointsCost),
      db
        .select({
          email: staffUsers.email,
          role: staffAssignments.role,
          branchName: branches.name,
        })
        .from(staffAssignments)
        .innerJoin(staffUsers, eq(staffUsers.id, staffAssignments.staffUserId))
        .leftJoin(branches, eq(branches.id, staffAssignments.branchId))
        .where(eq(staffAssignments.merchantId, merchantId))
        .orderBy(staffAssignments.role, staffUsers.email),
      db
        .select({
          id: purchases.id,
          customerName: customers.fullName,
          branchName: branches.name,
          amountCents: purchases.amountCents,
          points: purchases.pointsAwarded,
          status: purchases.status,
          voidReason: purchases.voidReason,
          createdAt: purchases.createdAt,
        })
        .from(purchases)
        .innerJoin(customers, eq(customers.id, purchases.customerId))
        .innerJoin(branches, eq(branches.id, purchases.branchId))
        .where(eq(purchases.merchantId, merchantId))
        .orderBy(desc(purchases.createdAt))
        .limit(50),
      db
        .select({
          id: redemptions.id,
          customerName: customers.fullName,
          branchName: branches.name,
          rewardName: rewards.name,
          points: redemptions.pointsSpent,
          status: redemptions.status,
          createdAt: redemptions.createdAt,
        })
        .from(redemptions)
        .innerJoin(customers, eq(customers.id, redemptions.customerId))
        .innerJoin(branches, eq(branches.id, redemptions.branchId))
        .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
        .where(eq(redemptions.merchantId, merchantId))
        .orderBy(desc(redemptions.createdAt))
        .limit(50),
      db
        .select({
          customers: countDistinct(purchases.customerId),
          purchases: count(),
          points: sum(purchases.pointsAwarded).mapWith(Number),
        })
        .from(purchases)
        .where(and(eq(purchases.merchantId, merchantId), eq(purchases.status, "confirmed"))),
      db
        .select({ redemptions: count() })
        .from(redemptions)
        .where(and(eq(redemptions.merchantId, merchantId), eq(redemptions.status, "completed"))),
    ]);

  return {
    merchant,
    program,
    branches: branchList,
    rewards: rewardList,
    staff: staffList,
    purchases: purchaseList,
    redemptions: redemptionList,
    stats: {
      customers: stats.customers,
      purchases: stats.purchases,
      pointsAwarded: stats.points ?? 0,
      redemptions: redeemStats.redemptions,
    },
  };
}

export async function listMerchants(db: DbOrTx) {
  return db
    .select({ id: merchants.id, name: merchants.name, slug: merchants.slug, status: merchants.status })
    .from(merchants)
    .orderBy(merchants.name);
}
