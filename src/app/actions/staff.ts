"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/auth/session";
import { registerPurchase, voidPurchase } from "@/server/services/purchases";
import { cancelRedemption, redeemWithCode } from "@/server/services/redemptions";
import {
  assignEmployee,
  createBranch,
  createReward,
  setRewardActive,
  updateProgram,
} from "@/server/services/management";
import { toActionError, type ActionState } from "@/lib/action-result";
import { formatMoney, parseMoneyToCents } from "@/lib/format";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function int(formData: FormData, name: string) {
  const value = Number(text(formData, name));
  return Number.isFinite(value) ? value : NaN;
}

// --- Sucursal --------------------------------------------------------------

export async function registerPurchaseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const amountCents = parseMoneyToCents(text(formData, "amount"));
  const eligibleRaw = text(formData, "eligibleAmount");
  const eligibleAmountCents = eligibleRaw ? parseMoneyToCents(eligibleRaw) : null;
  if (amountCents === null || (eligibleRaw && eligibleAmountCents === null)) return { error: "Importe inválido." };

  try {
    const branchId = text(formData, "branchId");
    const r = await registerPurchase(getDb(), staff, {
      branchId,
      qrToken: text(formData, "qrToken"),
      amountCents,
      eligibleAmountCents,
      externalReference: text(formData, "reference") || null,
      idempotencyKey: text(formData, "idempotencyKey"),
    });
    revalidatePath(`/comercio/sucursal/${branchId}`);
    return {
      message: `Compra de ${formatMoney(r.purchase.amountCents)} registrada: +${r.purchase.pointsAwarded} pts. Saldo: ${r.balance} pts.`,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function redeemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  try {
    const branchId = text(formData, "branchId");
    const r = await redeemWithCode(getDb(), staff, { branchId, code: text(formData, "code") });
    revalidatePath(`/comercio/sucursal/${branchId}`);
    return { message: `Canje aprobado: entregar "${r.reward.name}" (−${r.reward.pointsCost} pts). Saldo: ${r.balance} pts.` };
  } catch (error) {
    return toActionError(error);
  }
}

// --- Dueño -----------------------------------------------------------------

async function ownerAction(merchantId: string, run: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await run();
    revalidatePath(`/comercio/${merchantId}`);
    return { message };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidPurchaseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  return ownerAction(text(formData, "merchantId"), async () => {
    await voidPurchase(getDb(), staff, { purchaseId: text(formData, "purchaseId"), reason: text(formData, "reason") });
    return "Compra anulada.";
  });
}

export async function cancelRedemptionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  return ownerAction(text(formData, "merchantId"), async () => {
    await cancelRedemption(getDb(), staff, {
      redemptionId: text(formData, "redemptionId"),
      reason: text(formData, "reason"),
    });
    return "Canje cancelado y puntos devueltos.";
  });
}

export async function updateProgramAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const merchantId = text(formData, "merchantId");
  const unitAmountCents = parseMoneyToCents(text(formData, "unitAmount"));
  if (unitAmountCents === null) return { error: "Importe inválido." };
  return ownerAction(merchantId, async () => {
    await updateProgram(getDb(), staff, {
      merchantId,
      name: text(formData, "name"),
      active: formData.get("active") === "on",
      accrualBase: text(formData, "accrualBase") === "eligible" ? "eligible" : "total",
      pointsPerUnit: int(formData, "pointsPerUnit"),
      unitAmountCents,
    });
    return "Programa actualizado.";
  });
}

export async function createRewardAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const merchantId = text(formData, "merchantId");
  return ownerAction(merchantId, async () => {
    await createReward(getDb(), staff, {
      merchantId,
      name: text(formData, "name"),
      description: text(formData, "description") || null,
      pointsCost: int(formData, "pointsCost"),
    });
    return "Recompensa creada.";
  });
}

export async function toggleRewardAction(formData: FormData) {
  const { staff } = await requireStaff();
  await setRewardActive(getDb(), staff, {
    rewardId: text(formData, "rewardId"),
    active: text(formData, "active") === "true",
  });
  revalidatePath(`/comercio/${text(formData, "merchantId")}`);
}

export async function createBranchAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const merchantId = text(formData, "merchantId");
  return ownerAction(merchantId, async () => {
    await createBranch(getDb(), staff, {
      merchantId,
      name: text(formData, "name"),
      address: text(formData, "address") || null,
    });
    return "Sucursal creada.";
  });
}

export async function assignEmployeeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requireStaff();
  const merchantId = text(formData, "merchantId");
  return ownerAction(merchantId, async () => {
    await assignEmployee(getDb(), staff, {
      merchantId,
      branchId: text(formData, "branchId"),
      email: text(formData, "email"),
    });
    return "Empleado asignado.";
  });
}
