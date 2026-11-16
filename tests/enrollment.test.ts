import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { merchants, pointMovements, programMemberships } from "@/server/db/schema";
import { joinMerchant, updateCustomerContact } from "@/server/services/enrollment";
import { createCustomer, createMerchant, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

const profile = { phone: "11 2345 6789", birthDate: "1990-05-17" };


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

describe("datos de contacto", () => {
  it("guardar teléfono y cumpleaños no regala puntos", async () => {
    const m = await createMerchant(db);
    const { ctx } = await createCustomer(db);
    const { membership } = await joinMerchant(db, ctx, m.merchant.slug);

    await updateCustomerContact(db, ctx, profile);

    const [row] = await db.select().from(programMemberships).where(eq(programMemberships.id, membership.id));
    expect(row.balance).toBe(0);
    expect(await db.select().from(pointMovements).where(eq(pointMovements.membershipId, membership.id))).toHaveLength(0);
  });

  it("valida teléfono y fecha", async () => {
    const { ctx } = await createCustomer(db);
    await expect(updateCustomerContact(db, ctx, { phone: "abc", birthDate: "1990-05-17" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(updateCustomerContact(db, ctx, { phone: "1123456789", birthDate: "2999-01-01" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
