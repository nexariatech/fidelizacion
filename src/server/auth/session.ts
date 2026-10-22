import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCustomerContext, loadStaffContext, type CustomerContext, type StaffContext } from "./context";
import { createCustomerProfile } from "../services/customers";

export type Viewer = {
  authUserId: string;
  email: string;
  customer: CustomerContext;
  staff: StaffContext | null;
};

// Usuario de la request actual. Toda persona autenticada tiene cuenta global de
// cliente (se crea en el primer acceso); el rol de personal es adicional.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;

  const db = getDb();
  let customer = await loadCustomerContext(db, user.id);
  if (!customer) {
    const fullName = String(user.user_metadata?.full_name ?? "").trim() || user.email.split("@")[0];
    await createCustomerProfile(db, { authUserId: user.id, fullName, email: user.email }).catch(() => undefined);
    customer = await loadCustomerContext(db, user.id);
    if (!customer) throw new Error("No se pudo crear el perfil del cliente");
  }
  const staff = await loadStaffContext(db, user.id);
  return { authUserId: user.id, email: user.email, customer, staff };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireStaff(): Promise<Viewer & { staff: StaffContext }> {
  const viewer = await requireViewer();
  if (!viewer.staff || (viewer.staff.assignments.length === 0 && !viewer.staff.isPlatformAdmin)) redirect("/cliente");
  return viewer as Viewer & { staff: StaffContext };
}

export async function requirePlatformAdmin(): Promise<Viewer & { staff: StaffContext }> {
  const viewer = await requireViewer();
  if (!viewer.staff?.isPlatformAdmin) redirect("/cliente");
  return viewer as Viewer & { staff: StaffContext };
}
