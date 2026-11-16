import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { customers, loyaltyPrograms, merchants } from "../db/schema";
import type { CustomerContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { parse } from "../domain/validation";
import { ensureMembership } from "./memberships";

// Comercio activo con programa activo, para la página de alta por QR.
export async function findJoinableMerchant(db: DbOrTx, slug: string) {
  const [row] = await db
    .select({ id: merchants.id, name: merchants.name, programName: loyaltyPrograms.name })
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

const contactInput = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{8,20}$/, "Teléfono inválido"),
  birthDate: z.iso.date().refine((d) => {
    const year = Number(d.slice(0, 4));
    return year >= 1900 && new Date(d) < new Date();
  }, "Fecha inválida"),
});

// Teléfono y cumpleaños, opcionales. Ya no regalan puntos.
export async function updateCustomerContact(db: Db, ctx: CustomerContext, rawInput: z.input<typeof contactInput>) {
  const input = parse(contactInput, rawInput);
  await db.update(customers).set(input).where(eq(customers.id, ctx.customerId));
}
