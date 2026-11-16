import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { customers, staffUsers } from "../db/schema";
import { DomainError } from "../domain/errors";
import { dniSchema } from "../domain/dni";
import { parse } from "../domain/validation";
import { audit } from "./audit";

// Identificador opaco y no predecible (192 bits) para la tarjeta de Wallet.
export function newQrToken(): string {
  return randomBytes(24).toString("base64url");
}

const registerCustomerInput = z.object({
  authUserId: z.uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  dni: dniSchema,
  acceptPrivacy: z.boolean().refine((v) => v, "Hay que aceptar la política de privacidad"),
});

// Alta del cliente: nombre, DNI y aceptación de privacidad, todo obligatorio.
// Una cuenta de personal (dueño o empleado) no puede ser además cliente.
// Si el cliente ya existía sin DNI (cuentas anteriores a esta regla), lo completa.
export async function registerCustomer(db: Db, rawInput: z.input<typeof registerCustomerInput>) {
  const input = parse(registerCustomerInput, rawInput);
  return db.transaction(async (tx) => {
    const [staff] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.authUserId, input.authUserId));
    if (staff) throw new DomainError("account_type_conflict");

    const [taken] = await tx.select({ authUserId: customers.authUserId }).from(customers).where(eq(customers.dni, input.dni));
    if (taken && taken.authUserId !== input.authUserId) throw new DomainError("dni_taken");

    const values = {
      fullName: input.fullName,
      dni: input.dni,
      privacyAcceptedAt: new Date(),
    };
    const [customer] = await tx
      .insert(customers)
      .values({ ...values, authUserId: input.authUserId, email: input.email.toLowerCase(), qrToken: newQrToken() })
      .onConflictDoUpdate({ target: customers.authUserId, set: values })
      .returning()
      .catch((error) => {
        // Dos altas simultáneas con el mismo DNI: la segunda choca con el índice único.
        if (isUniqueViolation(error, "customers_dni_unique")) throw new DomainError("dni_taken");
        throw error;
      });
    await audit(tx, {
      merchantId: null,
      actorType: "customer",
      actorId: customer.id,
      action: "customer.registered",
      entityType: "customer",
      entityId: customer.id,
    });
    return customer;
  });
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === "23505") return pg.constraint_name === constraint;
  }
  return false;
}
