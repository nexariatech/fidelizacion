import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { customers, loyaltyPrograms, pointMovements, programMemberships, purchases } from "../db/schema";
import { requireOperableBranch, requireOwner, type StaffContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { calculatePoints } from "../domain/points";
import { parse } from "../domain/validation";
import { audit } from "./audit";
import { ensureMembership } from "./memberships";

const registerPurchaseInput = z.object({
  branchId: z.uuid(),
  qrToken: z.string().min(1),
  amountCents: z.number().int().positive(),
  eligibleAmountCents: z.number().int().nonnegative().nullish(),
  externalReference: z.string().max(200).nullish(),
  idempotencyKey: z.string().min(8).max(200),
});

export type RegisterPurchaseInput = z.input<typeof registerPurchaseInput>;

// Registra una compra identificando al cliente por su QR personal y otorga los
// puntos en la misma transacción. Reintentos con la misma idempotency_key
// devuelven la compra original sin volver a sumar puntos.
export async function registerPurchase(db: Db, ctx: StaffContext, rawInput: RegisterPurchaseInput) {
  const input = parse(registerPurchaseInput, rawInput);
  if (input.eligibleAmountCents != null && input.eligibleAmountCents > input.amountCents) {
    throw new DomainError("invalid_input", "El importe elegible no puede superar el total");
  }

  return db.transaction(async (tx) => {
    const branch = await requireOperableBranch(tx, ctx, input.branchId);

    const [program] = await tx
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.merchantId, branch.merchantId));
    if (!program || !program.active) throw new DomainError("program_inactive");

    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.qrToken, input.qrToken));
    if (!customer) throw new DomainError("not_found", "Cliente no encontrado");

    // La membresía se crea en la primera compra si el cliente no se unió antes.
    const membership = await ensureMembership(tx, program, customer.id);

    // Con la membresía bloqueada, los reintentos concurrentes del mismo cliente
    // se serializan y este chequeo ve la compra ya confirmada.
    const [existing] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.merchantId, branch.merchantId), eq(purchases.idempotencyKey, input.idempotencyKey)));
    if (existing) {
      if (existing.customerId !== customer.id || existing.amountCents !== input.amountCents) {
        throw new DomainError("idempotency_conflict");
      }
      return { purchase: existing, balance: membership.balance, replayed: true };
    }

    const rule = {
      accrualBase: program.accrualBase,
      pointsPerUnit: program.pointsPerUnit,
      unitAmountCents: program.unitAmountCents,
    };
    const { points } = calculatePoints(rule, input.amountCents, input.eligibleAmountCents);

    const [purchase] = await tx
      .insert(purchases)
      .values({
        merchantId: branch.merchantId,
        branchId: branch.id,
        membershipId: membership.id,
        customerId: customer.id,
        amountCents: input.amountCents,
        eligibleAmountCents: input.eligibleAmountCents ?? null,
        pointsAwarded: points,
        ruleSnapshot: rule,
        externalReference: input.externalReference ?? null,
        idempotencyKey: input.idempotencyKey,
        registeredBy: ctx.staffUserId,
      })
      .onConflictDoNothing()
      .returning();
    // Misma clave usada en paralelo para otro cliente.
    if (!purchase) throw new DomainError("idempotency_conflict");

    let balance = membership.balance;
    if (points > 0) {
      balance += points;
      await tx.update(programMemberships).set({ balance }).where(eq(programMemberships.id, membership.id));
      await tx.insert(pointMovements).values({
        merchantId: branch.merchantId,
        branchId: branch.id,
        membershipId: membership.id,
        type: "purchase",
        points,
        balanceAfter: balance,
        purchaseId: purchase.id,
        actorStaffId: ctx.staffUserId,
      });
    }

    await audit(tx, {
      merchantId: branch.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "purchase.registered",
      entityType: "purchase",
      entityId: purchase.id,
      data: { branchId: branch.id, amountCents: input.amountCents, points },
    });

    return { purchase, balance, replayed: false };
  });
}

const voidPurchaseInput = z.object({
  purchaseId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

// Anula una compra con un movimiento compensatorio. Solo el dueño del comercio.
// Si el cliente ya gastó esos puntos, la anulación se bloquea.
export async function voidPurchase(db: Db, ctx: StaffContext, rawInput: z.input<typeof voidPurchaseInput>) {
  const input = parse(voidPurchaseInput, rawInput);

  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, input.purchaseId))
      .for("update");
    if (!purchase) throw new DomainError("not_found");
    requireOwner(ctx, purchase.merchantId);
    if (purchase.status === "voided") throw new DomainError("already_voided");

    const [membership] = await tx
      .select()
      .from(programMemberships)
      .where(eq(programMemberships.id, purchase.membershipId))
      .for("update");

    let balance = membership.balance;
    if (purchase.pointsAwarded > 0) {
      if (membership.balance < purchase.pointsAwarded) throw new DomainError("points_already_spent");
      balance -= purchase.pointsAwarded;
      await tx.update(programMemberships).set({ balance }).where(eq(programMemberships.id, membership.id));
      await tx.insert(pointMovements).values({
        merchantId: purchase.merchantId,
        branchId: purchase.branchId,
        membershipId: membership.id,
        type: "purchase_void",
        points: -purchase.pointsAwarded,
        balanceAfter: balance,
        purchaseId: purchase.id,
        actorStaffId: ctx.staffUserId,
      });
    }

    const [voided] = await tx
      .update(purchases)
      .set({ status: "voided", voidedBy: ctx.staffUserId, voidReason: input.reason, voidedAt: sql`now()` })
      .where(eq(purchases.id, purchase.id))
      .returning();

    await audit(tx, {
      merchantId: purchase.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "purchase.voided",
      entityType: "purchase",
      entityId: purchase.id,
      data: { reason: input.reason, points: purchase.pointsAwarded },
    });

    return { purchase: voided, balance };
  });
}
