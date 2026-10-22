import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { programMemberships, redemptionAuthorizations, redemptions } from "@/server/db/schema";
import { registerPurchase } from "@/server/services/purchases";
import { cancelRedemption, redeemWithCode, requestRedemptionAuthorization } from "@/server/services/redemptions";
import { createCustomer, createMerchant, key, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

// Comercio + cliente con 120 puntos (recompensa cuesta 50).
async function scenario() {
  const m = await createMerchant(db);
  const c = await createCustomer(db);
  await registerPurchase(db, m.owner, {
    branchId: m.branchA.id,
    qrToken: c.customer.qrToken,
    amountCents: 1_200_000,
    idempotencyKey: key(),
  });
  return { m, c };
}

async function balanceOf(customerId: string) {
  const [row] = await db.select().from(programMemberships).where(eq(programMemberships.customerId, customerId));
  return row.balance;
}

describe("canje", () => {
  it("flujo completo: código → canje → descuento atómico", async () => {
    const { m, c } = await scenario();
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    expect(auth.code).toMatch(/^\d{6}$/);

    const r = await redeemWithCode(db, m.employeeA, { branchId: m.branchA.id, code: auth.code });
    expect(r.balance).toBe(70);
    expect(await balanceOf(c.customer.id)).toBe(70);

    // Un solo uso.
    await expect(redeemWithCode(db, m.employeeA, { branchId: m.branchA.id, code: auth.code })).rejects.toMatchObject({
      code: "authorization_invalid",
    });
  });

  it("el código no sirve en otra sucursal", async () => {
    const { m, c } = await scenario();
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    await expect(redeemWithCode(db, m.owner, { branchId: m.branchB.id, code: auth.code })).rejects.toMatchObject({
      code: "authorization_invalid",
    });
  });

  it("el código vencido no sirve", async () => {
    const { m, c } = await scenario();
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    await db
      .update(redemptionAuthorizations)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(redemptionAuthorizations.id, auth.authorizationId));
    await expect(redeemWithCode(db, m.employeeA, { branchId: m.branchA.id, code: auth.code })).rejects.toMatchObject({
      code: "authorization_invalid",
    });
    expect(await balanceOf(c.customer.id)).toBe(120);
  });

  it("pedir un código nuevo invalida el anterior", async () => {
    const { m, c } = await scenario();
    const first = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    const [row] = await db
      .select()
      .from(redemptionAuthorizations)
      .where(eq(redemptionAuthorizations.id, first.authorizationId));
    expect(row.status).toBe("cancelled");
  });

  it("sin puntos suficientes no se emite código", async () => {
    const m = await createMerchant(db);
    const c = await createCustomer(db);
    await registerPurchase(db, m.owner, { branchId: m.branchA.id, qrToken: c.customer.qrToken, amountCents: 100_000, idempotencyKey: key() });
    await expect(
      requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id }),
    ).rejects.toMatchObject({ code: "insufficient_points" });
  });

  it("el mismo código usado en paralelo solo canjea una vez", async () => {
    const { m, c } = await scenario();
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => redeemWithCode(db, m.employeeA, { branchId: m.branchA.id, code: auth.code })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(c.customer.id)).toBe(70);
  });

  it("dos sucursales no pueden gastar el mismo saldo a la vez", async () => {
    const m = await createMerchant(db);
    const c = await createCustomer(db);
    // 60 puntos: alcanza para un solo canje de 50.
    await registerPurchase(db, m.owner, { branchId: m.branchA.id, qrToken: c.customer.qrToken, amountCents: 600_000, idempotencyKey: key() });
    const authA = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    // Se inserta a mano un segundo código pendiente en la otra sucursal
    // (simula dos dispositivos con la sesión abierta).
    const [authB] = await db
      .insert(redemptionAuthorizations)
      .values({
        merchantId: m.merchant.id,
        branchId: m.branchB.id,
        membershipId: (await db.select().from(programMemberships).where(eq(programMemberships.customerId, c.customer.id)))[0].id,
        customerId: c.customer.id,
        rewardId: m.reward.id,
        code: "123456",
        expiresAt: sql`now() + interval '2 minutes'`,
      })
      .returning();

    const results = await Promise.allSettled([
      redeemWithCode(db, m.owner, { branchId: m.branchA.id, code: authA.code }),
      redeemWithCode(db, m.owner, { branchId: m.branchB.id, code: authB.code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(c.customer.id)).toBe(10);
  });

  it("el dueño cancela un canje y se devuelven los puntos", async () => {
    const { m, c } = await scenario();
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: m.reward.id, branchId: m.branchA.id });
    const r = await redeemWithCode(db, m.employeeA, { branchId: m.branchA.id, code: auth.code });

    await expect(cancelRedemption(db, m.employeeA, { redemptionId: r.redemption.id, reason: "Error" })).rejects.toMatchObject({
      code: "not_found",
    });
    const cancelled = await cancelRedemption(db, m.owner, { redemptionId: r.redemption.id, reason: "Producto agotado" });
    expect(cancelled.balance).toBe(120);
    await expect(cancelRedemption(db, m.owner, { redemptionId: r.redemption.id, reason: "Otra vez" })).rejects.toMatchObject({
      code: "already_cancelled",
    });
    const [row] = await db.select().from(redemptions).where(eq(redemptions.id, r.redemption.id));
    expect(row.status).toBe("cancelled");
  });
});
