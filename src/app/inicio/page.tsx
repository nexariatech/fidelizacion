import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth/session";

// Después del login: el personal va a su panel; el cliente, a sus puntos o a
// completar el alta con su DNI.
export default async function Inicio() {
  const viewer = await requireViewer();
  if (viewer.staff?.isPlatformAdmin) redirect("/admin");
  if (viewer.staff) redirect("/comercio");
  if (viewer.customer && viewer.customerHasDni) redirect("/cliente");
  redirect("/alta");
}
