import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { customers } from "../db/schema";
import type { CustomerContext } from "../auth/context";
import { parse } from "../domain/validation";
import { audit } from "./audit";

// Identificador opaco y no predecible (192 bits) para el QR personal.
export function newQrToken(): string {
  return randomBytes(24).toString("base64url");
}

const createCustomerInput = z.object({
  authUserId: z.uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().max(30).nullish(),
});

// Crea el perfil global del cliente tras registrarse en el proveedor de auth.
export async function createCustomerProfile(db: Db, rawInput: z.input<typeof createCustomerInput>) {
  const input = parse(createCustomerInput, rawInput);
  const [customer] = await db
    .insert(customers)
    .values({ ...input, email: input.email.toLowerCase(), phone: input.phone ?? null, qrToken: newQrToken() })
    .returning();
  return customer;
}

// Invalida el QR anterior si el cliente cree que fue comprometido.
export async function rotateQrToken(db: Db, ctx: CustomerContext) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .update(customers)
      .set({ qrToken: newQrToken() })
      .where(eq(customers.id, ctx.customerId))
      .returning({ qrToken: customers.qrToken });
    await audit(tx, {
      merchantId: null,
      actorType: "customer",
      actorId: ctx.customerId,
      action: "customer.qr_rotated",
      entityType: "customer",
      entityId: ctx.customerId,
    });
    return customer.qrToken;
  });
}
