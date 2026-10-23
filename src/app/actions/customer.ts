"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { requireViewer } from "@/server/auth/session";
import { rotateQrToken } from "@/server/services/customers";
import { requestRedemptionAuthorization } from "@/server/services/redemptions";
import { googleWalletSaveUrl, syncWalletQrToken } from "@/server/services/wallet";
import { toActionError } from "@/lib/action-result";

export type AuthorizationResult = { code: string; expiresAt: string } | { error: string };

export async function requestAuthorizationAction(rewardId: string, branchId: string): Promise<AuthorizationResult> {
  const viewer = await requireViewer();
  try {
    const r = await requestRedemptionAuthorization(getDb(), viewer.customer, { rewardId, branchId });
    return { code: r.code, expiresAt: r.expiresAt.toISOString() };
  } catch (error) {
    return toActionError(error);
  }
}

export async function rotateQrAction() {
  const viewer = await requireViewer();
  const qrToken = await rotateQrToken(getDb(), viewer.customer);
  after(() => syncWalletQrToken(getDb(), viewer.customer.customerId, qrToken));
  revalidatePath("/cliente");
}

export async function googleWalletAction(merchantId: string): Promise<{ url: string } | { error: string }> {
  const viewer = await requireViewer();
  try {
    const url = await googleWalletSaveUrl(getDb(), viewer.customer.customerId, merchantId);
    return url ? { url } : { error: "Google Wallet no está configurado." };
  } catch (error) {
    return toActionError(error);
  }
}
