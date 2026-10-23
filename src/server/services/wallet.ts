import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { customers, programMemberships } from "../db/schema";
import { googleWalletConfig, patchWalletObject, saveToWalletUrl } from "../integrations/google-wallet";
import { customerMerchantDetail } from "./queries";

function appOrigin() {
  return process.env.APP_ORIGIN ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

export function isGoogleWalletEnabled() {
  return googleWalletConfig(appOrigin()) !== null;
}

// Enlace para guardar en Google Wallet la tarjeta del cliente en un comercio.
export async function googleWalletSaveUrl(db: DbOrTx, customerId: string, merchantId: string) {
  const cfg = googleWalletConfig(appOrigin());
  if (!cfg) return null;
  const detail = await customerMerchantDetail(db, customerId, merchantId);
  const [customer] = await db
    .select({ fullName: customers.fullName, qrToken: customers.qrToken })
    .from(customers)
    .where(eq(customers.id, customerId));
  return saveToWalletUrl(cfg, {
    merchantId,
    merchantName: detail.merchant.name,
    programName: detail.program.name,
    membershipId: detail.membershipId,
    customerName: customer.fullName,
    qrToken: customer.qrToken,
    balance: detail.balance,
  });
}

// Refleja el saldo en la tarjeta. Nunca hace fallar la operación de puntos:
// los errores solo se registran.
export async function syncWalletBalance(membershipId: string, balance: number) {
  const cfg = googleWalletConfig(appOrigin());
  if (!cfg) return;
  await patchWalletObject(cfg, membershipId, { balance }).catch((error) =>
    console.error("No se pudo actualizar Google Wallet", error),
  );
}

export async function syncWalletQrToken(db: DbOrTx, customerId: string, qrToken: string) {
  const cfg = googleWalletConfig(appOrigin());
  if (!cfg) return;
  const memberships = await db
    .select({ id: programMemberships.id })
    .from(programMemberships)
    .where(eq(programMemberships.customerId, customerId));
  await Promise.all(
    memberships.map((m) =>
      patchWalletObject(cfg, m.id, { qrToken }).catch((error) =>
        console.error("No se pudo actualizar Google Wallet", error),
      ),
    ),
  );
}
