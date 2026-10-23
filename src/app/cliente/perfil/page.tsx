import { completeProfileAction } from "@/app/actions/customer";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { requireViewer } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { customerProfile } from "@/server/services/queries";

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const profile = await customerProfile(getDb(), viewer.customer.customerId);

  return (
    <Card title="Mis datos">
      <div className="max-w-md space-y-4">
        <p className="text-sm text-neutral-600">
          {profile.profileCompletedAt
            ? "Puedes actualizar tus datos cuando quieras."
            : "Completa tu teléfono y cumpleaños y cada comercio donde estás te regala puntos."}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Nombre</dt>
          <dd>{profile.fullName}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="break-all">{profile.email}</dd>
        </dl>
        <ActionForm action={completeProfileAction} submitLabel="Guardar mis datos">
          <Field label="Teléfono">
            <Input name="phone" type="tel" autoComplete="tel" placeholder="11 2345 6789" defaultValue={profile.phone ?? ""} required />
          </Field>
          <Field label="Fecha de nacimiento">
            <Input name="birthDate" type="date" autoComplete="bday" defaultValue={profile.birthDate ?? ""} required />
          </Field>
        </ActionForm>
      </div>
    </Card>
  );
}
