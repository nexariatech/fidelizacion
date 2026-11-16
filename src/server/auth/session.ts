import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { customers } from "../db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadStaffContext, type CustomerContext, type StaffContext } from "./context";
import { registerStaffAccount } from "../services/staff-accounts";

export type Viewer = {
  authUserId: string;
  email: string;
  fullName: string;
  // Cliente o personal, nunca las dos. Ambos nulos: cuenta recién creada que
  // todavía no completó el alta de cliente (DNI).
  customer: CustomerContext | null;
  // false si es una cuenta de cliente anterior a la regla del DNI.
  customerHasDni: boolean;
  staff: StaffContext | null;
};

type SignUpMetadata = { full_name?: unknown; account_type?: unknown; merchant_name?: unknown; branch_name?: unknown };

// Usuario de la request actual. El alta de personal se completa en el primer
// acceso después de confirmar el email, con los datos que dejó el formulario
// de /registro/comercio. El alta de cliente la hace el propio cliente en /alta.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const authUserId = claims?.sub;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!authUserId || !email) return null;

  const metadata = (claims.user_metadata ?? {}) as SignUpMetadata;
  const fullName = String(metadata.full_name ?? "").trim() || email.split("@")[0];

  const db = getDb();
  const [[customer], loadedStaff] = await Promise.all([
    db.select({ id: customers.id, dni: customers.dni }).from(customers).where(eq(customers.authUserId, authUserId)),
    loadStaffContext(db, authUserId),
  ]);
  let staff = loadedStaff;
  if (!customer && !staff && metadata.account_type === "staff") {
    const merchantName = String(metadata.merchant_name ?? "").trim();
    staff = await registerStaffAccount(db, {
      authUserId,
      email,
      fullName,
      merchant: merchantName ? { name: merchantName, branchName: String(metadata.branch_name ?? "").trim() || "Principal" } : null,
    }).catch((error) => {
      console.error("No se pudo completar el alta de personal", error);
      return null;
    });
  }
  return {
    authUserId,
    email,
    fullName,
    customer: customer ? { kind: "customer", customerId: customer.id } : null,
    customerHasDni: Boolean(customer?.dni),
    staff,
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

// Cliente con el alta completa (DNI). El personal no entra a las pantallas de cliente.
export async function requireCustomer(next = "/cliente"): Promise<Viewer & { customer: CustomerContext }> {
  const viewer = await requireViewer();
  if (viewer.staff) redirect("/inicio");
  if (!viewer.customer || !viewer.customerHasDni) redirect(`/alta?next=${encodeURIComponent(next)}`);
  return viewer as Viewer & { customer: CustomerContext };
}

export async function requireStaff(): Promise<Viewer & { staff: StaffContext }> {
  const viewer = await requireViewer();
  if (!viewer.staff) redirect("/inicio");
  return viewer as Viewer & { staff: StaffContext };
}

export async function requirePlatformAdmin(): Promise<Viewer & { staff: StaffContext }> {
  const viewer = await requireViewer();
  if (!viewer.staff?.isPlatformAdmin) redirect("/inicio");
  return viewer as Viewer & { staff: StaffContext };
}
