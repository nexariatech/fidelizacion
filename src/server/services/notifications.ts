import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { branches, customers, merchants, programMemberships, purchases } from "../db/schema";
import { sendEmail } from "../integrations/email";
import { googleWalletConfig, notifyWalletCard } from "../integrations/google-wallet";
import { appOrigin } from "./wallet";

// Aviso al cliente cada vez que suma puntos, para que detecte cargas a su DNI
// que no hizo: email (si tiene) y notificación en su tarjeta de Google Wallet
// (si la guardó). En la app, la compra aparece con el botón "No reconozco esta
// compra". Nunca hace fallar la operación: los errores solo se registran.
export async function notifyPointsEarned(db: DbOrTx, purchaseId: string) {
  const [row] = await db
    .select({
      purchase: purchases,
      merchantName: merchants.name,
      branchName: branches.name,
      email: customers.email,
      hasAccount: customers.authUserId,
      balance: programMemberships.balance,
    })
    .from(purchases)
    .innerJoin(merchants, eq(merchants.id, purchases.merchantId))
    .innerJoin(branches, eq(branches.id, purchases.branchId))
    .innerJoin(customers, eq(customers.id, purchases.customerId))
    .innerJoin(programMemberships, eq(programMemberships.id, purchases.membershipId))
    .where(eq(purchases.id, purchaseId));
  if (!row || row.purchase.pointsAwarded <= 0) return;

  const { purchase } = row;
  const origin = appOrigin();
  const header = `+${purchase.pointsAwarded} puntos en ${row.merchantName}`;
  const body = `Sumaste ${purchase.pointsAwarded} puntos en ${row.branchName}. Saldo: ${row.balance} puntos.`;

  const tasks: Promise<unknown>[] = [];
  if (row.email) {
    const next = row.hasAccount
      ? `Si no fuiste vos, entra a ${origin}/cliente/${purchase.merchantId} y toca "No reconozco esta compra".`
      : `Crea tu cuenta con este email y tu DNI en ${origin}/registro para ver tus puntos y canjearlos. Si no fuiste vos, responde este email.`;
    tasks.push(sendEmail({ to: row.email, subject: header, text: `${body}\n\n${next}` }));
  }
  const cfg = googleWalletConfig(origin);
  if (cfg) tasks.push(notifyWalletCard(cfg, purchase.membershipId, { id: `compra-${purchase.id}`, header, body }));

  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") console.error("No se pudo avisar al cliente", result.reason);
  }
}

// Bienvenida al cliente que registraron en la caja, solo si dio un email: le
// explica cómo crear su cuenta online (con ese email y su DNI) para ver sus
// puntos, canjear y guardar la tarjeta en Google Wallet.
export async function notifyCounterRegistration(db: DbOrTx, customerId: string, merchantId: string) {
  const [row] = await db
    .select({ email: customers.email, fullName: customers.fullName, hasAccount: customers.authUserId, merchantName: merchants.name })
    .from(customers)
    .innerJoin(merchants, eq(merchants.id, merchantId))
    .where(eq(customers.id, customerId));
  if (!row?.email || row.hasAccount) return;
  const firstName = row.fullName.trim().split(/\s+/)[0];
  await sendEmail({
    to: row.email,
    subject: `Te sumaste al programa de puntos de ${row.merchantName}`,
    text: [
      `Hola ${firstName}:`,
      `Te registraron en el programa de puntos de ${row.merchantName}. Para sumar puntos, solo di tu DNI en la caja.`,
      `Para ver tus puntos, canjear recompensas y guardar tu tarjeta en Google Wallet, crea tu cuenta en ${appOrigin()}/registro con este email y tu DNI.`,
      `Si no te registraste vos, responde este email.`,
    ].join("\n\n"),
  }).catch((error) => console.error("No se pudo enviar la bienvenida", error));
}
