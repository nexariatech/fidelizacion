import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLog, branches, customers, loyaltyPrograms, programMemberships, purchases, staffAssignments } from "@/server/db/schema";
import { disputePurchase, registerCustomer, registerCustomerAtCounter } from "@/server/services/customers";
import { registerStaffAccount } from "@/server/services/staff-accounts";
import { assignEmployee } from "@/server/services/management";
import { registerPurchase } from "@/server/services/purchases";
import { maskName, normalizeDni } from "@/server/domain/dni";
import { createAuthUser, createCustomer, createMerchant, key, newDni, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());

function customerInput(user: { id: string; email: string }, dni = newDni()) {
  return { authUserId: user.id, email: user.email, fullName: "Ana María López", dni, acceptPrivacy: true };
}

describe("DNI", () => {
  it("normaliza puntos y espacios y rechaza formatos inválidos", () => {
    expect(normalizeDni("30.123.456")).toBe("30123456");
    expect(normalizeDni(" 7 123 456 ")).toBe("7123456");
    expect(normalizeDni("123456")).toBeNull();
    expect(normalizeDni("30A23456")).toBeNull();
  });

  it("la caja ve solo nombre e inicial del apellido", () => {
    expect(maskName("Ana María López")).toBe("Ana L.");
    expect(maskName("Ana")).toBe("Ana");
  });
});

describe("alta de cliente", () => {
  it("exige DNI y aceptación de privacidad", async () => {
    const user = await createAuthUser(db);
    await expect(registerCustomer(db, { ...customerInput(user), dni: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(registerCustomer(db, { ...customerInput(user), acceptPrivacy: false })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const customer = await registerCustomer(db, customerInput(user, "30.555.444"));
    expect(customer.dni).toBe("30555444");
    expect(customer.privacyAcceptedAt).not.toBeNull();
  });

  it("un DNI pertenece a una sola cuenta en toda la plataforma", async () => {
    const dni = newDni();
    await registerCustomer(db, customerInput(await createAuthUser(db), dni));
    await expect(registerCustomer(db, customerInput(await createAuthUser(db), dni))).rejects.toMatchObject({
      code: "dni_taken",
    });
  });

  it("completa el DNI de una cuenta anterior sin duplicarla", async () => {
    const user = await createAuthUser(db);
    await db.insert(customers).values({ authUserId: user.id, fullName: "Viejo", email: user.email });
    const customer = await registerCustomer(db, customerInput(user));
    const rows = await db.select().from(customers).where(eq(customers.authUserId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].dni).toBe(customer.dni);
  });

  it("una cuenta de comercio no puede darse de alta como cliente", async () => {
    const user = await createAuthUser(db);
    await registerStaffAccount(db, { authUserId: user.id, email: user.email, fullName: "Dueño", merchant: null });
    await expect(registerCustomer(db, customerInput(user))).rejects.toMatchObject({ code: "account_type_conflict" });
  });
});

describe("alta de comercio", () => {
  it("el dueño crea su comercio con programa, sucursal y rol de dueño, sin ser cliente", async () => {
    const user = await createAuthUser(db);
    const ctx = await registerStaffAccount(db, {
      authUserId: user.id,
      email: user.email,
      fullName: "Dueña",
      merchant: { name: "Café Central", branchName: "Centro" },
    });
    expect(ctx?.assignments).toHaveLength(1);
    const { merchantId, role } = ctx!.assignments[0];
    expect(role).toBe("owner");
    expect(await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId))).toHaveLength(1);
    expect(await db.select().from(branches).where(eq(branches.merchantId, merchantId))).toHaveLength(1);
    expect(await db.select().from(customers).where(eq(customers.authUserId, user.id))).toHaveLength(0);

    // Repetir el alta (por ejemplo, dos requests en paralelo) no crea otro comercio.
    await registerStaffAccount(db, { authUserId: user.id, email: user.email, fullName: "Dueña", merchant: { name: "Café Central", branchName: "Centro" } });
    const assignments = await db.select().from(staffAssignments).where(eq(staffAssignments.merchantId, merchantId));
    expect(assignments).toHaveLength(1);
  });

  it("dos comercios con el mismo nombre reciben identificadores distintos", async () => {
    const make = async () => {
      const u = await createAuthUser(db);
      return registerStaffAccount(db, { authUserId: u.id, email: u.email, fullName: "Equis", merchant: { name: "Pizzería Roma", branchName: "Única" } });
    };
    const [a, b] = [await make(), await make()];
    expect(a!.assignments[0].merchantId).not.toBe(b!.assignments[0].merchantId);
  });

  it("una cuenta de cliente no puede ser personal ni empleado", async () => {
    const user = await createAuthUser(db);
    await registerCustomer(db, customerInput(user));
    await expect(registerStaffAccount(db, { authUserId: user.id, email: user.email, fullName: "Equis", merchant: null })).rejects.toMatchObject({
      code: "account_type_conflict",
    });
    const m = await createMerchant(db);
    await expect(
      assignEmployee(db, m.owner, { merchantId: m.merchant.id, branchId: m.branchA.id, email: user.email }),
    ).rejects.toMatchObject({ code: "account_type_conflict" });
  });
});

describe("compra por DNI", () => {
  it("suma puntos con el DNI, acepta puntos en el número y devuelve el nombre enmascarado", async () => {
    const m = await createMerchant(db);
    const { customer } = await createCustomer(db);
    const dotted = customer.dni!.replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3");
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni: dotted, amountCents: 30_000, idempotencyKey: key() });
    expect(r.purchase.customerId).toBe(customer.id);
    expect(r.purchase.pointsAwarded).toBe(3);
    expect(r.customerName).toBe("Cliente P.");
  });

  it("un DNI no registrado no suma puntos", async () => {
    const m = await createMerchant(db);
    await expect(
      registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni: "11111111", amountCents: 10_000, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: "dni_not_registered" });
  });
});

describe("alta en caja", () => {
  const counter = (branchId: string, dni = newDni(), extra: { email?: string } = {}) => ({
    branchId,
    dni,
    fullName: "Juan Pérez",
    acceptPrivacy: true,
    ...extra,
  });

  it("el empleado registra el DNI, el cliente queda unido al comercio y después suma puntos", async () => {
    const m = await createMerchant(db);
    const customer = await registerCustomerAtCounter(db, m.employeeA, counter(m.branchA.id, "28.111.222"));
    expect(customer).toMatchObject({ dni: "28111222", authUserId: null, registeredByStaffId: m.employeeA.staffUserId });
    expect(customer.privacyAcceptedAt).not.toBeNull();
    const memberships = await db.select().from(programMemberships).where(eq(programMemberships.customerId, customer.id));
    expect(memberships.map((x) => x.merchantId)).toEqual([m.merchant.id]);

    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni: "28111222", amountCents: 20_000, idempotencyKey: key() });
    expect(r).toMatchObject({ balance: 2, customerName: "Juan P." });
  });

  it("exige la aceptación de privacidad, no duplica DNIs y respeta el alcance del empleado", async () => {
    const m = await createMerchant(db);
    await expect(registerCustomerAtCounter(db, m.employeeA, { ...counter(m.branchA.id), acceptPrivacy: false })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const dni = newDni();
    await registerCustomerAtCounter(db, m.employeeA, counter(m.branchA.id, dni));
    await expect(registerCustomerAtCounter(db, m.owner, counter(m.branchB.id, dni))).rejects.toMatchObject({ code: "dni_taken" });
    await expect(registerCustomerAtCounter(db, m.employeeA, counter(m.branchB.id))).rejects.toMatchObject({ code: "not_found" });
  });

  it("el cliente reclama la cuenta online con su DNI y conserva los puntos", async () => {
    const m = await createMerchant(db);
    const dni = newDni();
    const atCounter = await registerCustomerAtCounter(db, m.employeeA, counter(m.branchA.id, dni));
    await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni, amountCents: 50_000, idempotencyKey: key() });

    const user = await createAuthUser(db);
    const claimed = await registerCustomer(db, customerInput(user, dni));
    expect(claimed.id).toBe(atCounter.id);
    expect(claimed).toMatchObject({ authUserId: user.id, email: user.email });
    const [membership] = await db.select().from(programMemberships).where(eq(programMemberships.customerId, claimed.id));
    expect(membership.balance).toBe(5);

    // Ya reclamada, nadie más la toma.
    await expect(registerCustomer(db, customerInput(await createAuthUser(db), dni))).rejects.toMatchObject({ code: "dni_taken" });
  });

  it("si la caja anotó un email, solo lo reclama quien entra con ese email", async () => {
    const m = await createMerchant(db);
    const dni = newDni();
    const owner = await createAuthUser(db);
    await registerCustomerAtCounter(db, m.employeeA, counter(m.branchA.id, dni, { email: owner.email.toUpperCase() }));

    await expect(registerCustomer(db, customerInput(await createAuthUser(db), dni))).rejects.toMatchObject({ code: "dni_taken" });
    expect((await registerCustomer(db, customerInput(owner, dni))).authUserId).toBe(owner.id);
  });
});

describe("aviso y reclamo de compras", () => {
  it("el cliente marca una compra que no reconoce y queda auditado", async () => {
    const m = await createMerchant(db);
    const { customer, ctx } = await createCustomer(db);
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni: customer.dni!, amountCents: 10_000, idempotencyKey: key() });

    await disputePurchase(db, ctx, { purchaseId: r.purchase.id });
    const [row] = await db.select().from(purchases).where(eq(purchases.id, r.purchase.id));
    expect(row.disputedAt).not.toBeNull();
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, r.purchase.id));
    expect(logs.map((l) => l.action)).toContain("purchase.disputed");

    // Una compra ajena no se puede reclamar.
    const other = await createCustomer(db);
    await expect(disputePurchase(db, other.ctx, { purchaseId: r.purchase.id })).rejects.toMatchObject({ code: "not_found" });
  });
});
