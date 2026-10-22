import { randomInt } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "../db/client";
import {
  branches,
  loyaltyPrograms,
  merchants,
  pointMovements,
  programMemberships,
  redemptionAuthorizations,
  redemptions,
  rewards,
} from "../db/schema";
import { requireOperableBranch, requireOwner, type CustomerContext, type StaffContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { parse } from "../domain/validation";
import { audit } from "./audit";
import { lockMembership } from "./memberships";

export const AUTHORIZATION_TTL_SECONDS = 120;

const requestAuthorizationInput = z.object({
  rewardId: z.uuid(),
  branchId: z.uuid(),
});

async function expireStaleAuthorizations(tx: Tx, branchId: string) {
  await tx
    .update(redemptionAuthorizations)
    .set({ status: "expired" })
    .where(
      and(
        eq(redemptionAuthorizations.branchId, branchId),
        eq(redemptionAuthorizations.status, "pending"),
        lt(redemptionAuthorizations.expiresAt, sql`now()`),
      ),
    );
}

// El cliente pide un código de 6 dígitos (también se muestra como QR dinámico)
// para canjear una recompensa en una sucursal. Vence a los 120 segundos y anula
// cualquier código pendiente anterior del mismo cliente en ese comercio.
export async function requestRedemptionAuthorization(
  db: Db,
  ctx: CustomerContext,
  rawInput: z.input<typeof requestAuthorizationInput>,
) {
  const input = parse(requestAuthorizationInput, rawInput);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ reward: rewards, merchant: merchants, program: loyaltyPrograms })
      .from(rewards)
      .innerJoin(merchants, eq(merchants.id, rewards.merchantId))
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, rewards.merchantId))
      .where(eq(rewards.id, input.rewardId));
    if (!row) throw new DomainError("not_found", "Recompensa no encontrada");
    if (row.merchant.status !== "active") throw new DomainError("merchant_suspended");
    if (!row.program.active) throw new DomainError("program_inactive");
    if (!row.reward.active) throw new DomainError("reward_inactive");

    const [branch] = await tx.select().from(branches).where(eq(branches.id, input.branchId));
    if (!branch || !branch.active || branch.merchantId !== row.reward.merchantId) {
      throw new DomainError("not_found", "Sucursal no encontrada");
    }

    const membership = await lockMembership(tx, row.program.id, ctx.customerId);
    if (membership.balance < row.reward.pointsCost) throw new DomainError("insufficient_points");

    await tx
      .update(redemptionAuthorizations)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(redemptionAuthorizations.membershipId, membership.id),
          eq(redemptionAuthorizations.status, "pending"),
        ),
      );
    await expireStaleAuthorizations(tx, branch.id);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const [authorization] = await tx
        .insert(redemptionAuthorizations)
        .values({
          merchantId: branch.merchantId,
          branchId: branch.id,
          membershipId: membership.id,
          customerId: ctx.customerId,
          rewardId: row.reward.id,
          code,
          expiresAt: sql`now() + make_interval(secs => ${AUTHORIZATION_TTL_SECONDS})`,
        })
        .onConflictDoNothing()
        .returning();
      if (authorization) {
        await audit(tx, {
          merchantId: branch.merchantId,
          actorType: "customer",
          actorId: ctx.customerId,
          action: "redemption_authorization.created",
          entityType: "redemption_authorization",
          entityId: authorization.id,
          data: { rewardId: row.reward.id, branchId: branch.id },
        });
        return { authorizationId: authorization.id, code, expiresAt: authorization.expiresAt };
      }
    }
    throw new Error("No se pudo generar un código único");
  });
}

const redeemInput = z.object({
  branchId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});

// El empleado ingresa (o escanea) el código del cliente. En una sola
// transacción: consume la autorización, valida saldo, crea el canje y descuenta.
export async function redeemWithCode(db: Db, ctx: StaffContext, rawInput: z.input<typeof redeemInput>) {
  const input = parse(redeemInput, rawInput);

  return db.transaction(async (tx) => {
    const branch = await requireOperableBranch(tx, ctx, input.branchId);

    // Primero se bloquea la membresía y después la autorización, el mismo orden
    // que usa requestRedemptionAuthorization, para evitar interbloqueos.
    const [candidate] = await tx
      .select()
      .from(redemptionAuthorizations)
      .where(
        and(
          eq(redemptionAuthorizations.branchId, branch.id),
          eq(redemptionAuthorizations.code, input.code),
          eq(redemptionAuthorizations.status, "pending"),
        ),
      );
    if (!candidate) throw new DomainError("authorization_invalid");

    const [membership] = await tx
      .select()
      .from(programMemberships)
      .where(eq(programMemberships.id, candidate.membershipId))
      .for("update");

    const [authorization] = await tx
      .update(redemptionAuthorizations)
      .set({ status: "used", usedAt: sql`now()` })
      .where(
        and(
          eq(redemptionAuthorizations.id, candidate.id),
          eq(redemptionAuthorizations.status, "pending"),
          sql`${redemptionAuthorizations.expiresAt} > now()`,
        ),
      )
      .returning();
    if (!authorization) throw new DomainError("authorization_invalid");

    const [reward] = await tx.select().from(rewards).where(eq(rewards.id, authorization.rewardId));
    if (!reward.active) throw new DomainError("reward_inactive");
    if (membership.balance < reward.pointsCost) throw new DomainError("insufficient_points");

    const [redemption] = await tx
      .insert(redemptions)
      .values({
        merchantId: branch.merchantId,
        branchId: branch.id,
        membershipId: membership.id,
        customerId: authorization.customerId,
        rewardId: reward.id,
        authorizationId: authorization.id,
        pointsSpent: reward.pointsCost,
        redeemedBy: ctx.staffUserId,
      })
      .returning();

    const balance = membership.balance - reward.pointsCost;
    await tx.update(programMemberships).set({ balance }).where(eq(programMemberships.id, membership.id));
    await tx.insert(pointMovements).values({
      merchantId: branch.merchantId,
      branchId: branch.id,
      membershipId: membership.id,
      type: "redemption",
      points: -reward.pointsCost,
      balanceAfter: balance,
      redemptionId: redemption.id,
      actorStaffId: ctx.staffUserId,
    });

    await audit(tx, {
      merchantId: branch.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "redemption.completed",
      entityType: "redemption",
      entityId: redemption.id,
      data: { rewardId: reward.id, points: reward.pointsCost },
    });

    return { redemption, reward, balance };
  });
}

const cancelRedemptionInput = z.object({
  redemptionId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

// Solo el dueño, con motivo. Devuelve los puntos con un movimiento compensatorio.
export async function cancelRedemption(
  db: Db,
  ctx: StaffContext,
  rawInput: z.input<typeof cancelRedemptionInput>,
) {
  const input = parse(cancelRedemptionInput, rawInput);

  return db.transaction(async (tx) => {
    const [redemption] = await tx.select().from(redemptions).where(eq(redemptions.id, input.redemptionId));
    if (!redemption) throw new DomainError("not_found");
    requireOwner(ctx, redemption.merchantId);

    const [membership] = await tx
      .select()
      .from(programMemberships)
      .where(eq(programMemberships.id, redemption.membershipId))
      .for("update");

    const [cancelled] = await tx
      .update(redemptions)
      .set({ status: "cancelled", cancelledBy: ctx.staffUserId, cancelReason: input.reason, cancelledAt: sql`now()` })
      .where(and(eq(redemptions.id, redemption.id), eq(redemptions.status, "completed")))
      .returning();
    if (!cancelled) throw new DomainError("already_cancelled");

    const balance = membership.balance + redemption.pointsSpent;
    await tx.update(programMemberships).set({ balance }).where(eq(programMemberships.id, membership.id));
    await tx.insert(pointMovements).values({
      merchantId: redemption.merchantId,
      branchId: redemption.branchId,
      membershipId: membership.id,
      type: "redemption_cancel",
      points: redemption.pointsSpent,
      balanceAfter: balance,
      redemptionId: redemption.id,
      actorStaffId: ctx.staffUserId,
    });

    await audit(tx, {
      merchantId: redemption.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "redemption.cancelled",
      entityType: "redemption",
      entityId: redemption.id,
      data: { reason: input.reason, points: redemption.pointsSpent },
    });

    return { redemption: cancelled, balance };
  });
}
