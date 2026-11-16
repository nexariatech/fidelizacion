import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { registerCustomerAtCounter } from "@/server/services/customers";
import { notifyPointsEarned } from "@/server/services/notifications";
import { registerPurchase } from "@/server/services/purchases";
import { createMerchant, key, newDni, setupTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("aviso al sumar puntos", () => {
  it("envía un email con los puntos y el saldo cuando hay email y Resend configurado", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Puntos <avisos@example.com>");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const m = await createMerchant(db);
    const dni = newDni();
    await registerCustomerAtCounter(db, m.employeeA, { branchId: m.branchA.id, dni, fullName: "Juan Pérez", email: "juan@example.com", acceptPrivacy: true });
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni, amountCents: 30_000, idempotencyKey: key() });

    await notifyPointsEarned(db, r.purchase.id);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: "juan@example.com", subject: "+3 puntos en Comercio" });
    expect(body.text).toContain("Saldo: 3 puntos");
    expect(body.text).toContain("/registro");
  });

  it("sin email ni Wallet no intenta enviar nada", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "avisos@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const m = await createMerchant(db);
    const dni = newDni();
    await registerCustomerAtCounter(db, m.employeeA, { branchId: m.branchA.id, dni, fullName: "Sin Email", acceptPrivacy: true });
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni, amountCents: 30_000, idempotencyKey: key() });

    await notifyPointsEarned(db, r.purchase.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
