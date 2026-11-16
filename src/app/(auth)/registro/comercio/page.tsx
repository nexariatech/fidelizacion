"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpStaff } from "@/app/actions/auth";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";

// Alta de dueños y empleados, separada de la de clientes: esta cuenta no suma
// puntos como cliente.
export default function StaffSignUpPage() {
  const [state, action, pending] = useActionState(signUpStaff, null);
  const [role, setRole] = useState<"owner" | "employee">("owner");
  return (
    <Card title="Registrar mi comercio">
      <form action={action} className="space-y-4">
        <fieldset className="grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ["owner", "Soy dueño"],
              ["employee", "Soy empleado"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border p-2 text-center ${role === value ? "border-indigo-600 bg-indigo-50 font-medium" : "border-neutral-300"}`}
            >
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </fieldset>
        {role === "owner" ? (
          <>
            <Field label="Nombre del comercio">
              <Input name="merchantName" required minLength={2} />
            </Field>
            <Field label="Primera sucursal" hint="Puedes agregar más después">
              <Input name="branchName" placeholder="Principal" />
            </Field>
          </>
        ) : (
          <p className="text-sm text-neutral-600">
            Crea tu cuenta y pásale tu email al dueño para que te asigne a una sucursal.
          </p>
        )}
        <Field label="Tu nombre y apellido">
          <Input name="fullName" autoComplete="name" required minLength={2} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creando…" : "Crear cuenta de comercio"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-indigo-700">
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
