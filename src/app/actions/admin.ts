"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/auth/session";
import { createMerchant } from "@/server/services/management";
import { toActionError, type ActionState } from "@/lib/action-result";
import { parseMoneyToCents } from "@/lib/format";

export async function createMerchantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requirePlatformAdmin();
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const unitAmountCents = parseMoneyToCents(get("unitAmount"));
  if (unitAmountCents === null) return { error: "Importe inválido." };
  try {
    await createMerchant(getDb(), staff, {
      name: get("name"),
      slug: get("slug").toLowerCase(),
      branchName: get("branchName"),
      ownerEmail: get("ownerEmail"),
      programName: get("programName"),
      accrualBase: get("accrualBase") === "eligible" ? "eligible" : "total",
      pointsPerUnit: Number(get("pointsPerUnit")),
      unitAmountCents,
    });
    revalidatePath("/admin");
    return { message: "Comercio creado." };
  } catch (error) {
    return toActionError(error);
  }
}
