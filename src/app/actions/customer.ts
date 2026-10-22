"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { requireViewer } from "@/server/auth/session";
import { rotateQrToken } from "@/server/services/customers";
import { requestRedemptionAuthorization } from "@/server/services/redemptions";
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
  await rotateQrToken(getDb(), viewer.customer);
  revalidatePath("/cliente");
}
