import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLog, pointMovements } from "@/server/db/schema";
import { registerPurchase, voidPurchase } from "@/server/services/purchases";
import { createCustomer, createMerchant, key, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

describe("registerPurchase", () => {
  it("otorga puntos, crea la membresía y deja movimiento y auditoría", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);

    const r = await registerPurchase(db, m.employeeA, {
      branchId: m.branchA.id,
      qrToken: customer.qrToken,
      amountCents: 35_000,
      idempotencyKey: key(),
    });

    expect(r.purchase.pointsAwarded).toBe(3);
    expect(r.balance).toBe(3);
    const movements = await db.select().from(pointMovements).where(eq(pointMovements.purchaseId, r.purchase.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ points: 3, balanceAfter: 3, branchId: m.branchA.id });
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, r.purchase.id));
    expect(audits[0].action).toBe("purchase.registered");
  });

  it("el saldo se comparte entre sucursales del mismo comercio", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    await registerPurchase(db, m.owner, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 20_000, idempotencyKey: key() });
    const r = await registerPurchase(db, m.owner, { branchId: m.branchB.id, qrToken: customer.qrToken, amountCents: 30_000, idempotencyKey: key() });
    expect(r.balance).toBe(5);
  });

  it("un reintento con la misma clave no duplica puntos", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    const input = { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 50_000, idempotencyKey: key() };

    const results = await Promise.all([
      registerPurchase(db, m.employeeA, input),
      registerPurchase(db, m.employeeA, input),
      registerPurchase(db, m.employeeA, input),
    ]);

    expect(new Set(results.map((r) => r.purchase.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(Math.max(...results.map((r) => r.balance))).toBe(5);
  });

  it("rechaza la misma clave con otro importe", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    const k = key();
    await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 10_000, idempotencyKey: k });
    await expect(
      registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 99_000, idempotencyKey: k }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("calcula sobre el importe elegible si el programa lo pide", async () => {
    const m = await createMerchant(db, { accrualBase: "eligible" });
    const { customer } = await createCustomer(db);
    const r = await registerPurchase(db, m.employeeA, {
      branchId: m.branchA.id,
      qrToken: customer.qrToken,
      amountCents: 80_000,
      eligibleAmountCents: 30_000,
      idempotencyKey: key(),
    });
    expect(r.purchase.pointsAwarded).toBe(3);
  });

  it("rechaza QR inexistente e importes inválidos", async () => {
    const m = await createMerchant(db);
    await expect(
      registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: "no-existe", amountCents: 10_000, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: "not_found" });
    const { customer } = await createCustomer(db);
    await expect(
      registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: -5, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("voidPurchase", () => {
  it("el dueño anula y se descuentan los puntos", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 40_000, idempotencyKey: key() });

    const v = await voidPurchase(db, m.owner, { purchaseId: r.purchase.id, reason: "Error de carga" });
    expect(v.purchase.status).toBe("voided");
    expect(v.balance).toBe(0);
    await expect(voidPurchase(db, m.owner, { purchaseId: r.purchase.id, reason: "Otra vez" })).rejects.toMatchObject({
      code: "already_voided",
    });
  });

  it("un empleado no puede anular", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, qrToken: customer.qrToken, amountCents: 40_000, idempotencyKey: key() });
    await expect(voidPurchase(db, m.employeeA, { purchaseId: r.purchase.id, reason: "Error" })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
