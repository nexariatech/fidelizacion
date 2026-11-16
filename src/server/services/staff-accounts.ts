import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { branches, customers, loyaltyPrograms, merchants, staffAssignments, staffUsers } from "../db/schema";
import { loadStaffContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { parse } from "../domain/validation";
import { audit } from "./audit";

// "Café Central" → "cafe-central"
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Programa inicial de un comercio que se registra solo: 1 punto cada $100.
// El dueño lo ajusta después desde su panel.
export const DEFAULT_PROGRAM = { pointsPerUnit: 1, unitAmountCents: 10_000 } as const;

const registerStaffInput = z.object({
  authUserId: z.uuid(),
  email: z.email(),
  fullName: z.string().trim().min(2).max(120),
  // Sin comercio: empleado que espera que un dueño lo asigne a una sucursal.
  merchant: z
    .object({
      name: z.string().trim().min(2).max(120),
      branchName: z.string().trim().min(2).max(120),
    })
    .nullish(),
});

// Alta de personal, separada de la de clientes: crea la cuenta de personal y,
// si es dueño, su comercio con programa y primera sucursal. Repetirla no hace
// nada. Una cuenta que ya es cliente no puede ser personal.
export async function registerStaffAccount(db: Db, rawInput: z.input<typeof registerStaffInput>) {
  const input = parse(registerStaffInput, rawInput);
  await db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.authUserId, input.authUserId));
    if (customer) throw new DomainError("account_type_conflict");

    const [user] = await tx
      .insert(staffUsers)
      .values({ authUserId: input.authUserId, email: input.email.toLowerCase(), fullName: input.fullName })
      .onConflictDoNothing()
      .returning();
    if (!user || !input.merchant) return;

    const base = slugify(input.merchant.name) || "comercio";
    let merchant: typeof merchants.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !merchant; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 54)}-${Math.random().toString(36).slice(2, 7)}`;
      [merchant] = await tx.insert(merchants).values({ name: input.merchant.name, slug }).onConflictDoNothing().returning();
    }
    if (!merchant) throw new Error("No se pudo generar un identificador para el comercio");

    await tx.insert(loyaltyPrograms).values({ merchantId: merchant.id, name: `Puntos ${merchant.name}`, ...DEFAULT_PROGRAM });
    const [branch] = await tx.insert(branches).values({ merchantId: merchant.id, name: input.merchant.branchName }).returning();
    await tx.insert(staffAssignments).values({ staffUserId: user.id, merchantId: merchant.id, role: "owner" });
    await audit(tx, {
      merchantId: merchant.id,
      actorType: "staff",
      actorId: user.id,
      action: "merchant.self_registered",
      entityType: "merchant",
      entityId: merchant.id,
      data: { branchId: branch.id },
    });
  });
  return loadStaffContext(db, input.authUserId);
}
