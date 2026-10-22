import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { registerPurchase, voidPurchase } from "@/server/services/purchases";
import { redeemWithCode, requestRedemptionAuthorization } from "@/server/services/redemptions";
import { createCustomer, createMerchant, key, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

describe("aislamiento entre comercios y sucursales", () => {
  it("un empleado no registra compras en otra sucursal de su comercio", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    await expect(
      registerPurchase(db, m.employeeA, { branchId: m.branchB.id, qrToken: customer.qrToken, amountCents: 10_000, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("el dueño de un comercio no opera sucursales de otro", async () => {
    const a = await createMerchant(db);
    const b = await createMerchant(db);
    const { customer } = await createCustomer(db);
    await expect(
      registerPurchase(db, a.owner, { branchId: b.branchA.id, qrToken: customer.qrToken, amountCents: 10_000, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: "not_found" });

    const p = await registerPurchase(db, b.owner, { branchId: b.branchA.id, qrToken: customer.qrToken, amountCents: 10_000, idempotencyKey: key() });
    await expect(voidPurchase(db, a.owner, { purchaseId: p.purchase.id, reason: "Intento" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("los puntos de un comercio no sirven en otro", async () => {
    const a = await createMerchant(db);
    const b = await createMerchant(db);
    const c = await createCustomer(db);
    await registerPurchase(db, a.owner, { branchId: a.branchA.id, qrToken: c.customer.qrToken, amountCents: 1_000_000, idempotencyKey: key() });
    await expect(
      requestRedemptionAuthorization(db, c.ctx, { rewardId: b.reward.id, branchId: b.branchA.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    // La recompensa de A no se puede pedir para una sucursal de B.
    await expect(
      requestRedemptionAuthorization(db, c.ctx, { rewardId: a.reward.id, branchId: b.branchA.id }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("un comercio no puede usar un código emitido para otro", async () => {
    const a = await createMerchant(db);
    const b = await createMerchant(db);
    const c = await createCustomer(db);
    await registerPurchase(db, a.owner, { branchId: a.branchA.id, qrToken: c.customer.qrToken, amountCents: 1_000_000, idempotencyKey: key() });
    const auth = await requestRedemptionAuthorization(db, c.ctx, { rewardId: a.reward.id, branchId: a.branchA.id });
    await expect(redeemWithCode(db, b.owner, { branchId: b.branchA.id, code: auth.code })).rejects.toMatchObject({
      code: "authorization_invalid",
    });
  });
});
