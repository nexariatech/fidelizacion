import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { customers, loyaltyPrograms, purchases, staffUsers } from "../db/schema";
import { requireOperableBranch, type CustomerContext, type StaffContext } from "../auth/context";
import { DomainError } from "../domain/errors";
import { dniSchema } from "../domain/dni";
import { parse } from "../domain/validation";
import { audit } from "./audit";
import { ensureMembership } from "./memberships";

const fullName = z.string().trim().min(2).max(120);
const acceptPrivacy = z.boolean().refine((v) => v, "Hay que aceptar la política de privacidad");

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === "23505") return pg.constraint_name === constraint;
  }
  return false;
}

// Dos altas simultáneas con el mismo DNI o email chocan con el índice único.
function mapUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, "customers_dni_unique")) throw new DomainError("dni_taken");
  if (isUniqueViolation(error, "customers_email_unique")) {
    throw new DomainError("invalid_input", "Ese email ya pertenece a otro cliente.");
  }
  throw error;
}

const registerCustomerInput = z.object({
  authUserId: z.uuid(),
  fullName,
  email: z.email(),
  dni: dniSchema,
  acceptPrivacy,
});

// Alta online del cliente: nombre, DNI y aceptación de privacidad, todo
// obligatorio. Una cuenta de personal no puede ser además cliente.
// - Si el DNI lo registró antes una caja, la persona reclama esa cuenta (y sus
//   puntos). Si la caja anotó un email, solo puede reclamarla quien entra con ese
//   email; si no anotó ninguno, la reclama el primero que entra con ese DNI.
// - Si la persona ya tenía cuenta sin DNI (anterior a esta regla), la completa.
export async function registerCustomer(db: Db, rawInput: z.input<typeof registerCustomerInput>) {
  const input = parse(registerCustomerInput, rawInput);
  const email = input.email.toLowerCase();
  return db.transaction(async (tx) => {
    const [staff] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.authUserId, input.authUserId));
    if (staff) throw new DomainError("account_type_conflict");

    const [own] = await tx.select().from(customers).where(eq(customers.authUserId, input.authUserId));
    const [byDni] = await tx.select().from(customers).where(eq(customers.dni, input.dni)).for("update");

    let customer: typeof customers.$inferSelect;
    let action = "customer.registered";
    if (byDni && byDni.authUserId === null) {
      // Cuenta creada en una caja: se reclama.
      if (own) throw new DomainError("dni_taken");
      if (byDni.email && byDni.email !== email) {
        throw new DomainError("dni_taken", "Ese DNI se registró en un comercio con otro email. Entra con ese email.");
      }
      [customer] = await tx
        .update(customers)
        .set({ authUserId: input.authUserId, email, fullName: input.fullName, privacyAcceptedAt: new Date() })
        .where(and(eq(customers.id, byDni.id), isNull(customers.authUserId)))
        .returning()
        .catch(mapUniqueViolation);
      if (!customer) throw new DomainError("dni_taken");
      action = "customer.claimed";
    } else if (byDni && byDni.authUserId !== input.authUserId) {
      throw new DomainError("dni_taken");
    } else {
      const values = { fullName: input.fullName, dni: input.dni, privacyAcceptedAt: new Date() };
      [customer] = await tx
        .insert(customers)
        .values({ ...values, authUserId: input.authUserId, email })
        .onConflictDoUpdate({ target: customers.authUserId, set: values })
        .returning()
        .catch(mapUniqueViolation);
    }
    await audit(tx, {
      merchantId: null,
      actorType: "customer",
      actorId: customer.id,
      action,
      entityType: "customer",
      entityId: customer.id,
    });
    return customer;
  });
}

const counterInput = z.object({
  branchId: z.uuid(),
  dni: dniSchema,
  fullName,
  email: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .pipe(z.union([z.literal(""), z.email("Email inválido")]))
    .transform((v) => v || null)
    .nullish(),
  acceptPrivacy,
});

// Alta en la caja: el empleado registra al cliente con su DNI (y el nombre)
// antes de sumarle puntos. El cliente aceptó la política de privacidad de
// palabra; queda registrado quién lo dio de alta. Lo une al comercio.
export async function registerCustomerAtCounter(db: Db, ctx: StaffContext, rawInput: z.input<typeof counterInput>) {
  const input = parse(counterInput, rawInput);
  return db.transaction(async (tx) => {
    const branch = await requireOperableBranch(tx, ctx, input.branchId);
    const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, branch.merchantId));
    if (!program || !program.active) throw new DomainError("program_inactive");

    const [existing] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.dni, input.dni));
    if (existing) {
      throw new DomainError("dni_taken", "Ese DNI ya está registrado: ya puedes sumarle puntos.");
    }
    const [customer] = await tx
      .insert(customers)
      .values({
        dni: input.dni,
        fullName: input.fullName,
        email: input.email ?? null,
        privacyAcceptedAt: new Date(),
        registeredByStaffId: ctx.staffUserId,
      })
      .returning()
      .catch(mapUniqueViolation);
    await ensureMembership(tx, program, customer.id);
    await audit(tx, {
      merchantId: branch.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "customer.registered_at_counter",
      entityType: "customer",
      entityId: customer.id,
      data: { branchId: branch.id, withEmail: Boolean(input.email) },
    });
    return customer;
  });
}

const disputeInput = z.object({ purchaseId: z.uuid() });

// El cliente avisa que no reconoce una compra cargada a su DNI. El dueño la ve
// marcada en su panel y decide si la anula.
export async function disputePurchase(db: Db, ctx: CustomerContext, rawInput: z.input<typeof disputeInput>) {
  const input = parse(disputeInput, rawInput);
  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .update(purchases)
      .set({ disputedAt: new Date() })
      .where(and(eq(purchases.id, input.purchaseId), eq(purchases.customerId, ctx.customerId), isNull(purchases.disputedAt)))
      .returning();
    if (!purchase) throw new DomainError("not_found");
    await audit(tx, {
      merchantId: purchase.merchantId,
      actorType: "customer",
      actorId: ctx.customerId,
      action: "purchase.disputed",
      entityType: "purchase",
      entityId: purchase.id,
    });
    return purchase;
  });
}
