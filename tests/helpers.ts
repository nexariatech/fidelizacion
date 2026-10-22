import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Db } from "@/server/db/client";
import {
  branches,
  customers,
  loyaltyPrograms,
  merchants,
  rewards,
  staffAssignments,
  staffUsers,
} from "@/server/db/schema";
import { loadStaffContext, type CustomerContext, type StaffContext } from "@/server/auth/context";
import { newQrToken } from "@/server/services/customers";

export async function setupTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL no está configurada");
  const { db, sqlClient } = createDb(url);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => sqlClient.end() };
}

export async function createStaff(db: Db, assignments: { merchantId: string; branchId?: string; role: "owner" | "employee" }[]) {
  const authUserId = randomUUID();
  const [user] = await db
    .insert(staffUsers)
    .values({ authUserId, fullName: "Staff", email: `${authUserId}@test.local` })
    .returning();
  for (const a of assignments) {
    await db.insert(staffAssignments).values({ staffUserId: user.id, merchantId: a.merchantId, branchId: a.branchId ?? null, role: a.role });
  }
  return (await loadStaffContext(db, authUserId)) as StaffContext;
}

export async function createCustomer(db: Db) {
  const authUserId = randomUUID();
  const [customer] = await db
    .insert(customers)
    .values({ authUserId, fullName: "Cliente", email: `${authUserId}@test.local`, qrToken: newQrToken() })
    .returning();
  const ctx: CustomerContext = { kind: "customer", customerId: customer.id };
  return { customer, ctx };
}

// Comercio con 2 sucursales, programa 1 punto cada $100 y una recompensa de 50 puntos.
export async function createMerchant(db: Db, opts: { accrualBase?: "total" | "eligible" } = {}) {
  const slug = `m-${randomUUID()}`;
  const [merchant] = await db.insert(merchants).values({ name: "Comercio", slug }).returning();
  const [branchA, branchB] = await db
    .insert(branches)
    .values([
      { merchantId: merchant.id, name: "Centro" },
      { merchantId: merchant.id, name: "Norte" },
    ])
    .returning();
  const [program] = await db
    .insert(loyaltyPrograms)
    .values({
      merchantId: merchant.id,
      name: "Programa",
      accrualBase: opts.accrualBase ?? "total",
      pointsPerUnit: 1,
      unitAmountCents: 10_000,
    })
    .returning();
  const [reward] = await db
    .insert(rewards)
    .values({ merchantId: merchant.id, name: "Café gratis", pointsCost: 50 })
    .returning();
  const owner = await createStaff(db, [{ merchantId: merchant.id, role: "owner" }]);
  const employeeA = await createStaff(db, [{ merchantId: merchant.id, branchId: branchA.id, role: "employee" }]);
  return { merchant, branchA, branchB, program, reward, owner, employeeA };
}

export function key() {
  return randomUUID();
}
