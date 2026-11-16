import { and, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { loyaltyPrograms, programMemberships } from "../db/schema";
import { DomainError } from "../domain/errors";

type Program = typeof loyaltyPrograms.$inferSelect;

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

// Crea la membresía si no existe y la devuelve bloqueada.
export async function ensureMembership(tx: Tx, program: Program, customerId: string) {
  await tx
    .insert(programMemberships)
    .values({ programId: program.id, merchantId: program.merchantId, customerId })
    .onConflictDoNothing();
  return lockMembership(tx, program.id, customerId);
}
