import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { loadStaffContext } from "@/server/auth/context";
import {
  assignEmployee,
  createBranch,
  createMerchant,
  createReward,
  setRewardActive,
  updateProgram,
} from "@/server/services/management";
import { registerPurchase } from "@/server/services/purchases";
import { customerMerchantDetail, customerOverview, ownerDashboard, staffBranches } from "@/server/services/queries";
import {
  createAuthUser,
  createCustomer,
  createMerchant as createMerchantFixture,
  createPlatformAdmin,
  key,
  setupTestDb,
} from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

const rule = { accrualBase: "total" as const, pointsPerUnit: 1, unitAmountCents: 10_000 };

describe("alta de comercio", () => {
  it("el administrador crea comercio, programa, sucursal y dueño", async () => {
    const admin = await createPlatformAdmin(db);
    const owner = await createAuthUser(db, "Duenia@Cafe.test");
    const r = await createMerchant(db, admin, {
      name: "Café Central",
      slug: "cafe-central",
      branchName: "Centro",
      ownerEmail: "duenia@cafe.test",
      programName: "Club Café",
      ...rule,
    });
    const ownerCtx = await loadStaffContext(db, owner.id);
    expect(ownerCtx?.assignments).toEqual([{ merchantId: r.merchant.id, branchId: null, role: "owner" }]);
  });

  it("solo el administrador de plataforma puede crear comercios", async () => {
    const m = await createMerchantFixture(db);
    await createAuthUser(db, "otro@test.local");
    await expect(
      createMerchant(db, m.owner, {
        name: "Comercio X",
        slug: "x-x-x",
        branchName: "Sucursal",
        ownerEmail: "otro@test.local",
        programName: "Plan Z",
        ...rule,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("el dueño debe estar registrado", async () => {
    const admin = await createPlatformAdmin(db);
    await expect(
      createMerchant(db, admin, {
        name: "Sin dueño",
        slug: "sin-duenio",
        branchName: "Centro",
        ownerEmail: "nadie@test.local",
        programName: "Plan",
        ...rule,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("gestión del dueño", () => {
  it("crea sucursal, asigna empleado y el empleado solo ve esa sucursal", async () => {
    const m = await createMerchantFixture(db);
    const branch = await createBranch(db, m.owner, { merchantId: m.merchant.id, name: "Sur" });
    const employee = await createAuthUser(db);
    await assignEmployee(db, m.owner, { merchantId: m.merchant.id, branchId: branch.id, email: employee.email });

    const ctx = (await loadStaffContext(db, employee.id))!;
    const visible = await staffBranches(db, ctx);
    expect(visible.map((b) => b.branchId)).toEqual([branch.id]);
    expect(await staffBranches(db, m.owner)).toHaveLength(3);
  });

  it("un empleado no puede gestionar", async () => {
    const m = await createMerchantFixture(db);
    await expect(createBranch(db, m.employeeA, { merchantId: m.merchant.id, name: "Nueva" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      createReward(db, m.employeeA, { merchantId: m.merchant.id, name: "Gratis", pointsCost: 1 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("no se asigna un empleado a una sucursal de otro comercio", async () => {
    const a = await createMerchantFixture(db);
    const b = await createMerchantFixture(db);
    const employee = await createAuthUser(db);
    await expect(
      assignEmployee(db, a.owner, { merchantId: a.merchant.id, branchId: b.branchA.id, email: employee.email }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("recompensas y regla de puntos", async () => {
    const m = await createMerchantFixture(db);
    const reward = await createReward(db, m.owner, { merchantId: m.merchant.id, name: "Medialuna", pointsCost: 10 });
    await setRewardActive(db, m.owner, { rewardId: reward.id, active: false });
    const program = await updateProgram(db, m.owner, {
      merchantId: m.merchant.id,
      name: "Nuevo",
      active: true,
      accrualBase: "total",
      pointsPerUnit: 2,
      unitAmountCents: 10_000,
    });
    expect(program.pointsPerUnit).toBe(2);

    const { customer, ctx } = await createCustomer(db);
    await registerPurchase(db, m.employeeA, {
      branchId: m.branchA.id,
      qrToken: customer.qrToken,
      amountCents: 30_000,
      idempotencyKey: key(),
    });
    const detail = await customerMerchantDetail(db, ctx.customerId, m.merchant.id);
    expect(detail.balance).toBe(6);
    expect(detail.rewards.map((r) => r.name)).not.toContain("Medialuna");
  });
});

describe("consultas", () => {
  it("el cliente ve sus saldos por comercio y nada de comercios donde no compró", async () => {
    const a = await createMerchantFixture(db);
    const b = await createMerchantFixture(db);
    const { customer, ctx } = await createCustomer(db);
    await registerPurchase(db, a.owner, { branchId: a.branchA.id, qrToken: customer.qrToken, amountCents: 50_000, idempotencyKey: key() });

    const overview = await customerOverview(db, ctx.customerId);
    expect(overview.memberships).toHaveLength(1);
    expect(overview.memberships[0]).toMatchObject({ merchantId: a.merchant.id, balance: 5 });
    await expect(customerMerchantDetail(db, ctx.customerId, b.merchant.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("el tablero del dueño cuenta clientes únicos y no se abre para otro comercio", async () => {
    const m = await createMerchantFixture(db);
    const other = await createMerchantFixture(db);
    const c1 = await createCustomer(db);
    const c2 = await createCustomer(db);
    for (const c of [c1, c1, c2]) {
      await registerPurchase(db, m.owner, { branchId: m.branchA.id, qrToken: c.customer.qrToken, amountCents: 20_000, idempotencyKey: key() });
    }
    const dash = await ownerDashboard(db, m.owner, m.merchant.id);
    expect(dash.stats).toEqual({ customers: 2, purchases: 3, pointsAwarded: 6, redemptions: 0 });
    await expect(ownerDashboard(db, other.owner, m.merchant.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
