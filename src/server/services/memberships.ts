import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { customers, loyaltyPrograms, pointMovements, programMemberships } from "../db/schema";
import { DomainError } from "../domain/errors";

type Program = typeof loyaltyPrograms.$inferSelect;
type Membership = typeof programMemberships.$inferSelect;

// Bloquea la membresía hasta el fin de la transacción. Toda operación que
// cambie el saldo pasa por aquí, así dos operaciones nunca gastan el mismo saldo.
export async function lockMembership(tx: Tx, programId: string, customerId: string) {
  const [membership] = await tx
    .select()
    .from(programMemberships)
    .where(and(eq(programMemberships.programId, programId), eq(programMemberships.customerId, customerId)))
    .for("update");
  if (!membership) throw new DomainError("not_found", "Membresía no encontrada");
  return membership;
}

// Crea la membresía si no existe y la devuelve bloqueada. Si el cliente ya
// completó su perfil, acredita el regalo de este comercio.
export async function ensureMembership(tx: Tx, program: Program, customerId: string) {
  await tx
    .insert(programMemberships)
    .values({ programId: program.id, merchantId: program.merchantId, customerId })
    .onConflictDoNothing();
  const membership = await lockMembership(tx, program.id, customerId);
  const [customer] = await tx
    .select({ profileCompletedAt: customers.profileCompletedAt })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!customer.profileCompletedAt) return membership;
  return grantProfileBonus(tx, program, membership);
}

// Acredita una sola vez por membresía los puntos de regalo por completar el
// perfil. La membresía debe estar bloqueada.
export async function grantProfileBonus(tx: Tx, program: Program, membership: Membership): Promise<Membership> {
  if (membership.profileBonusGrantedAt || program.profileBonusPoints <= 0 || !program.active) return membership;
  const points = program.profileBonusPoints;
  const [updated] = await tx
    .update(programMemberships)
    .set({ balance: sql`${programMemberships.balance} + ${points}`, profileBonusGrantedAt: new Date() })
    .where(eq(programMemberships.id, membership.id))
    .returning();
  await tx.insert(pointMovements).values({
    merchantId: program.merchantId,
    branchId: null,
    membershipId: membership.id,
    type: "profile_bonus",
    points,
    balanceAfter: updated.balance,
  });
  return updated;
}
