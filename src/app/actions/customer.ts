"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { requireCustomer, requireViewer } from "@/server/auth/session";
import { registerCustomer } from "@/server/services/customers";
import { completeCustomerProfile } from "@/server/services/enrollment";
import { requestRedemptionAuthorization } from "@/server/services/redemptions";
import { googleWalletSaveUrl, syncWalletCards } from "@/server/services/wallet";
import { GoogleWalletError } from "@/server/integrations/google-wallet";
import { toActionError, type ActionState } from "@/lib/action-result";
import { safeNextPath } from "@/lib/origin";

export type AuthorizationResult = { code: string; expiresAt: string } | { error: string };

// Alta del cliente con DNI obligatorio. Al terminar sigue a donde iba (por
// ejemplo, /unirse/<comercio> si llegó desde el QR del mostrador).
export async function registerCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  if (viewer.staff) return { error: "Esta es una cuenta de comercio. Para sumar puntos como cliente usa otro email." };
  try {
    await registerCustomer(getDb(), {
      authUserId: viewer.authUserId,
      email: viewer.email,
      fullName: String(formData.get("fullName") ?? ""),
      dni: String(formData.get("dni") ?? ""),
      acceptPrivacy: formData.get("acceptPrivacy") === "on",
    });
  } catch (error) {
    return toActionError(error);
  }
  redirect(safeNextPath(formData.get("next") || "/cliente"));
}

export async function requestAuthorizationAction(rewardId: string, branchId: string): Promise<AuthorizationResult> {
  const viewer = await requireCustomer();
  try {
    const r = await requestRedemptionAuthorization(getDb(), viewer.customer, { rewardId, branchId });
    return { code: r.code, expiresAt: r.expiresAt.toISOString() };
  } catch (error) {
    return toActionError(error);
  }
}

export async function googleWalletAction(merchantId: string): Promise<{ url: string } | { error: string }> {
  const viewer = await requireCustomer();
  try {
    const url = await googleWalletSaveUrl(getDb(), viewer.customer.customerId, merchantId);
    return url ? { url } : { error: "Google Wallet no está configurado." };
  } catch (error) {
    if (error instanceof GoogleWalletError) {
      console.error(error);
      return { error: error.message };
    }
    return toActionError(error);
  }
}

export async function completeProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await requireCustomer();
  try {
    const memberships = await completeCustomerProfile(getDb(), viewer.customer, {
      phone: String(formData.get("phone") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
    });
    after(() => syncWalletCards(getDb(), viewer.customer.customerId));
    revalidatePath("/cliente", "layout");
    return { message: memberships.length ? "Listo. Ya sumaste tus puntos de regalo." : "Datos guardados." };
  } catch (error) {
    return toActionError(error);
  }
}
