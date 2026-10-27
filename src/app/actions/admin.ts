"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/auth/session";
import { createMerchant } from "@/server/services/management";
import { toActionError, type ActionState } from "@/lib/action-result";
import { parseMoneyToCents } from "@/lib/format";

// "Café Central" → "cafe-central"
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createMerchantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { staff } = await requirePlatformAdmin();
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const unitAmountCents = parseMoneyToCents(get("unitAmount"));
  if (unitAmountCents === null) return { error: "Importe inválido." };
  try {
    await createMerchant(getDb(), staff, {
      name: get("name"),
      slug: slugify(get("slug") || get("name")),
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
