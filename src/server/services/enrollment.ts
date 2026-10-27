import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { customers, loyaltyPrograms, merchants, programMemberships } from "../db/schema";
import type { CustomerContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { parse } from "../domain/validation";
import { audit } from "./audit";
import { ensureMembership, grantProfileBonus, lockMembership } from "./memberships";

// Comercio activo con programa activo, para la página de alta por QR.
export async function findJoinableMerchant(db: DbOrTx, slug: string) {
  const [row] = await db
    .select({ id: merchants.id, name: merchants.name, programName: loyaltyPrograms.name, bonus: loyaltyPrograms.profileBonusPoints })
    .from(merchants)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
    .where(and(eq(merchants.slug, slug), eq(merchants.status, "active"), eq(loyaltyPrograms.active, true)));
  return row ?? null;
}

// El cliente se une al programa del comercio desde el QR del mostrador.
// Repetirlo no hace nada: devuelve la misma membresía.
export async function joinMerchant(db: Db, ctx: CustomerContext, slug: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ program: loyaltyPrograms })
      .from(merchants)
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
      .where(and(eq(merchants.slug, slug), eq(merchants.status, "active")));
    if (!row || !row.program.active) throw new DomainError("not_found", "Comercio no encontrado");
    const membership = await ensureMembership(tx, row.program, ctx.customerId);
    return { merchantId: row.program.merchantId, membership };
  });
}

const profileInput = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{8,20}$/, "Teléfono inválido"),
  birthDate: z.iso.date().refine((d) => {
    const year = Number(d.slice(0, 4));
    return year >= 1900 && new Date(d) < new Date();
  }, "Fecha inválida"),
});

// Guarda teléfono y cumpleaños. La primera vez acredita el regalo en cada
// comercio donde el cliente ya es miembro.
export async function completeCustomerProfile(db: Db, ctx: CustomerContext, rawInput: z.input<typeof profileInput>) {
  const input = parse(profileInput, rawInput);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ profileCompletedAt: customers.profileCompletedAt })
      .from(customers)
      .where(eq(customers.id, ctx.customerId))
      .for("update");
    await tx
      .update(customers)
      .set({ phone: input.phone, birthDate: input.birthDate, profileCompletedAt: before.profileCompletedAt ?? new Date() })
      .where(eq(customers.id, ctx.customerId));

    const memberships = await tx
      .select({ programId: programMemberships.programId })
      .from(programMemberships)
      .where(eq(programMemberships.customerId, ctx.customerId));
    const programs = memberships.length
      ? await tx.select().from(loyaltyPrograms).where(inArray(loyaltyPrograms.id, memberships.map((m) => m.programId))).orderBy(loyaltyPrograms.id)
      : [];

    const updated = [];
    for (const program of programs) {
      const membership = await lockMembership(tx, program.id, ctx.customerId);
      updated.push(await grantProfileBonus(tx, program, membership));
    }
    await audit(tx, {
      merchantId: null,
      actorType: "customer",
      actorId: ctx.customerId,
      action: "customer.profile_completed",
      entityType: "customer",
      entityId: ctx.customerId,
    });
    return updated.map((m) => ({ membershipId: m.id, balance: m.balance }));
  });
}
