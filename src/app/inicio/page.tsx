import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth/session";

// Después del login: el personal va a su panel, el resto al panel del cliente.
export default async function Inicio() {
  const viewer = await requireViewer();
  if (viewer.staff?.isPlatformAdmin) redirect("/admin");
  if (viewer.staff && viewer.staff.assignments.length > 0) redirect("/comercio");
  redirect("/cliente");
}
