import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "../db/client";
import { branches, loyaltyPrograms, merchants, rewards, staffAssignments, staffUsers } from "../db/schema";
import { requireOwner, type StaffContext } from "../auth/context";
import { findAuthUserIdByEmail } from "../auth/identity";
import { DomainError } from "../domain/errors";
import { parse } from "../domain/validation";
import { audit } from "./audit";

const ruleFields = {
  accrualBase: z.enum(["total", "eligible"]),
  pointsPerUnit: z.number().int().positive().max(1_000),
  unitAmountCents: z.number().int().positive(),
};

// La persona debe haberse registrado antes; así no hace falta la clave de
// servicio de Supabase para crear cuentas.
async function ensureStaffUser(tx: Tx, email: string) {
  const normalized = email.trim().toLowerCase();
  const authUserId = await findAuthUserIdByEmail(tx, normalized);
  if (!authUserId) throw new DomainError("not_found", "No existe una cuenta con ese email. Debe registrarse primero.");
  await tx
    .insert(staffUsers)
    .values({ authUserId, email: normalized, fullName: normalized.split("@")[0] })
    .onConflictDoNothing();
  const [user] = await tx.select().from(staffUsers).where(eq(staffUsers.authUserId, authUserId));
  return user;
}

const createMerchantInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/),
  branchName: z.string().trim().min(2).max(120),
  ownerEmail: z.email(),
  programName: z.string().trim().min(2).max(120),
  ...ruleFields,
});

// Alta de comercio por el administrador de plataforma: comercio, programa,
// primera sucursal y dueño.
export async function createMerchant(db: Db, ctx: StaffContext, rawInput: z.input<typeof createMerchantInput>) {
  if (!ctx.isPlatformAdmin) throw new DomainError("forbidden");
  const input = parse(createMerchantInput, rawInput);

  return db.transaction(async (tx) => {
    const [merchant] = await tx
      .insert(merchants)
      .values({ name: input.name, slug: input.slug })
      .onConflictDoNothing()
      .returning();
    if (!merchant) throw new DomainError("invalid_input", "Ese identificador de comercio ya existe");
    await tx.insert(loyaltyPrograms).values({
      merchantId: merchant.id,
      name: input.programName,
      accrualBase: input.accrualBase,
      pointsPerUnit: input.pointsPerUnit,
      unitAmountCents: input.unitAmountCents,
    });
    const [branch] = await tx.insert(branches).values({ merchantId: merchant.id, name: input.branchName }).returning();
    const owner = await ensureStaffUser(tx, input.ownerEmail);
    await tx.insert(staffAssignments).values({ staffUserId: owner.id, merchantId: merchant.id, role: "owner" });

    await audit(tx, {
      merchantId: merchant.id,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "merchant.created",
      entityType: "merchant",
      entityId: merchant.id,
      data: { ownerEmail: owner.email, branchId: branch.id },
    });
    return { merchant, branch };
  });
}

const updateProgramInput = z.object({
  merchantId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  active: z.boolean(),
  ...ruleFields,
});

export async function updateProgram(db: Db, ctx: StaffContext, rawInput: z.input<typeof updateProgramInput>) {
  const input = parse(updateProgramInput, rawInput);
  requireOwner(ctx, input.merchantId);
  return db.transaction(async (tx) => {
    const { merchantId, ...values } = input;
    const [program] = await tx
      .update(loyaltyPrograms)
      .set(values)
      .where(eq(loyaltyPrograms.merchantId, merchantId))
      .returning();
    await audit(tx, {
      merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "program.updated",
      entityType: "loyalty_program",
      entityId: program.id,
      data: values,
    });
    return program;
  });
}

const createBranchInput = z.object({
  merchantId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).nullish(),
});

export async function createBranch(db: Db, ctx: StaffContext, rawInput: z.input<typeof createBranchInput>) {
  const input = parse(createBranchInput, rawInput);
  requireOwner(ctx, input.merchantId);
  return db.transaction(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ merchantId: input.merchantId, name: input.name, address: input.address ?? null })
      .returning();
    await audit(tx, {
      merchantId: input.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "branch.created",
      entityType: "branch",
      entityId: branch.id,
    });
    return branch;
  });
}

const assignEmployeeInput = z.object({
  merchantId: z.uuid(),
  branchId: z.uuid(),
  email: z.email(),
});

export async function assignEmployee(db: Db, ctx: StaffContext, rawInput: z.input<typeof assignEmployeeInput>) {
  const input = parse(assignEmployeeInput, rawInput);
  requireOwner(ctx, input.merchantId);
  return db.transaction(async (tx) => {
    const [branch] = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.id, input.branchId), eq(branches.merchantId, input.merchantId)));
    if (!branch) throw new DomainError("not_found", "Sucursal no encontrada");
    const user = await ensureStaffUser(tx, input.email);
    const [assignment] = await tx
      .insert(staffAssignments)
      .values({ staffUserId: user.id, merchantId: input.merchantId, branchId: branch.id, role: "employee" })
      .onConflictDoNothing()
      .returning();
    await audit(tx, {
      merchantId: input.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "staff.assigned",
      entityType: "staff_user",
      entityId: user.id,
      data: { branchId: branch.id },
    });
    return assignment ?? null;
  });
}

const createRewardInput = z.object({
  merchantId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  pointsCost: z.number().int().positive(),
});

export async function createReward(db: Db, ctx: StaffContext, rawInput: z.input<typeof createRewardInput>) {
  const input = parse(createRewardInput, rawInput);
  requireOwner(ctx, input.merchantId);
  return db.transaction(async (tx) => {
    const [reward] = await tx
      .insert(rewards)
      .values({ ...input, description: input.description ?? null })
      .returning();
    await audit(tx, {
      merchantId: input.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: "reward.created",
      entityType: "reward",
      entityId: reward.id,
      data: { pointsCost: input.pointsCost },
    });
    return reward;
  });
}

const setRewardActiveInput = z.object({ rewardId: z.uuid(), active: z.boolean() });

export async function setRewardActive(db: Db, ctx: StaffContext, rawInput: z.input<typeof setRewardActiveInput>) {
  const input = parse(setRewardActiveInput, rawInput);
  return db.transaction(async (tx) => {
    const [reward] = await tx.select().from(rewards).where(eq(rewards.id, input.rewardId));
    if (!reward) throw new DomainError("not_found");
    requireOwner(ctx, reward.merchantId);
    const [updated] = await tx
      .update(rewards)
      .set({ active: input.active })
      .where(eq(rewards.id, reward.id))
      .returning();
    await audit(tx, {
      merchantId: reward.merchantId,
      actorType: "staff",
      actorId: ctx.staffUserId,
      action: input.active ? "reward.activated" : "reward.deactivated",
      entityType: "reward",
      entityId: reward.id,
    });
    return updated;
  });
}
