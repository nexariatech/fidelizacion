import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { registerCustomerAtCounter } from "@/server/services/customers";
import { notifyCounterRegistration, notifyPointsEarned } from "@/server/services/notifications";
import { registerPurchase } from "@/server/services/purchases";
import { createMerchant, key, newDni, setupTestDb } from "./helpers";

const sendMail = vi.fn(async () => ({}));
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ default: { createTransport: (...args: unknown[]) => createTransport(...(args as [])) } }));

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
});
afterAll(async () => close());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sendMail.mockClear();
  createTransport.mockClear();
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

  it("con SMTP configurado (Gmail) envía por SMTP y no por Resend", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "puntos.demo@gmail.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const m = await createMerchant(db);
    const dni = newDni();
    await registerCustomerAtCounter(db, m.employeeA, { branchId: m.branchA.id, dni, fullName: "Ana Ruiz", email: "ana@example.com", acceptPrivacy: true });
    const r = await registerPurchase(db, m.employeeA, { branchId: m.branchA.id, dni, amountCents: 30_000, idempotencyKey: key() });

    await notifyPointsEarned(db, r.purchase.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "puntos.demo@gmail.com", pass: "app-password" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "puntos.demo@gmail.com", to: "ana@example.com", subject: "+3 puntos en Comercio" }),
    );
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

describe("bienvenida al registrar en caja", () => {
  it("envía el email con el link para crear la cuenta, solo si dio email", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "avisos@example.com");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const m = await createMerchant(db);

    const withEmail = await registerCustomerAtCounter(db, m.employeeA, {
      branchId: m.branchA.id, dni: newDni(), fullName: "Laura Gómez", email: "laura@example.com", acceptPrivacy: true,
    });
    await notifyCounterRegistration(db, withEmail.id, withEmail.merchantId);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ to: "laura@example.com", subject: "Te sumaste al programa de puntos de Comercio" });
    expect(body.text).toContain("Hola Laura:");
    expect(body.text).toContain("/registro");

    const noEmail = await registerCustomerAtCounter(db, m.employeeA, { branchId: m.branchA.id, dni: newDni(), fullName: "Sin Mail", acceptPrivacy: true });
    await notifyCounterRegistration(db, noEmail.id, noEmail.merchantId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
