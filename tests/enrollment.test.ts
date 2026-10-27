import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { loyaltyPrograms, merchants, pointMovements, programMemberships } from "@/server/db/schema";
import { completeCustomerProfile, joinMerchant } from "@/server/services/enrollment";
import { registerPurchase } from "@/server/services/purchases";
import { createCustomer, createMerchant, key, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

const profile = { phone: "11 2345 6789", birthDate: "1990-05-17" };

async function bonusMovements(membershipId: string) {
  return db
    .select()
    .from(pointMovements)
    .where(and(eq(pointMovements.membershipId, membershipId), eq(pointMovements.type, "profile_bonus")));
}

describe("alta por QR del mostrador", () => {
  it("une al cliente con saldo 0 y repetirlo no duplica la membresía", async () => {
    const m = await createMerchant(db);
    const { ctx } = await createCustomer(db);

    const first = await joinMerchant(db, ctx, m.merchant.slug);
    const again = await joinMerchant(db, ctx, m.merchant.slug);

    expect(first.merchantId).toBe(m.merchant.id);
    expect(again.membership.id).toBe(first.membership.id);
    expect(first.membership.balance).toBe(0);
  });

  it("rechaza comercios suspendidos o inexistentes", async () => {
    const m = await createMerchant(db);
    const { ctx } = await createCustomer(db);
    await db.update(merchants).set({ status: "suspended" }).where(eq(merchants.id, m.merchant.id));

    await expect(joinMerchant(db, ctx, m.merchant.slug)).rejects.toMatchObject({ code: "not_found" });
    await expect(joinMerchant(db, ctx, "no-existe")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("completar datos", () => {
  it("regala los puntos de cada comercio una sola vez", async () => {
    const a = await createMerchant(db);
    const b = await createMerchant(db);
    await db.update(loyaltyPrograms).set({ profileBonusPoints: 80 }).where(eq(loyaltyPrograms.id, b.program.id));
    const { ctx } = await createCustomer(db);
    const ja = await joinMerchant(db, ctx, a.merchant.slug);
    const jb = await joinMerchant(db, ctx, b.merchant.slug);

    const result = await completeCustomerProfile(db, ctx, profile);
    await completeCustomerProfile(db, ctx, { ...profile, phone: "11 9999 0000" });

    expect(result.map((r) => r.balance).sort()).toEqual([50, 80]);
    expect(await bonusMovements(ja.membership.id)).toHaveLength(1);
    const [movement] = await bonusMovements(jb.membership.id);
    expect(movement).toMatchObject({ points: 80, balanceAfter: 80, branchId: null });
  });

  it("un comercio nuevo regala al unirse si el perfil ya estaba completo", async () => {
    const m = await createMerchant(db);
    const { ctx } = await createCustomer(db);
    await completeCustomerProfile(db, ctx, profile);

    const { membership } = await joinMerchant(db, ctx, m.merchant.slug);

    expect(membership.balance).toBe(50);
  });

  it("también regala si la membresía nace en la primera compra", async () => {
    const m = await createMerchant(db);
    const { customer, ctx } = await createCustomer(db);
    await completeCustomerProfile(db, ctx, profile);

    const r = await registerPurchase(db, m.employeeA, {
      branchId: m.branchA.id,
      qrToken: customer.qrToken,
      amountCents: 30_000,
      idempotencyKey: key(),
    });

    expect(r.balance).toBe(53);
  });

  it("con regalo en 0 no acredita nada", async () => {
    const m = await createMerchant(db);
    await db.update(loyaltyPrograms).set({ profileBonusPoints: 0 }).where(eq(loyaltyPrograms.id, m.program.id));
    const { ctx } = await createCustomer(db);
    const { membership } = await joinMerchant(db, ctx, m.merchant.slug);

    await completeCustomerProfile(db, ctx, profile);

    const [row] = await db.select().from(programMemberships).where(eq(programMemberships.id, membership.id));
    expect(row.balance).toBe(0);
    expect(await bonusMovements(membership.id)).toHaveLength(0);
  });

  it("valida teléfono y fecha", async () => {
    const { ctx } = await createCustomer(db);
    await expect(completeCustomerProfile(db, ctx, { phone: "abc", birthDate: "1990-05-17" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(completeCustomerProfile(db, ctx, { phone: "1123456789", birthDate: "2999-01-01" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
