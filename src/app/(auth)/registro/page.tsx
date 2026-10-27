"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { GoogleButton } from "../login/forms";

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, null);
  return (
    <Card title="Crear cuenta">
      <p className="mb-4 text-sm text-neutral-600">Una sola cuenta para sumar puntos en todos los comercios.</p>
      <div className="mb-5 space-y-3">
        <GoogleButton next="/inicio" />
        <p className="text-center text-xs text-neutral-500">o crea una cuenta con contraseña</p>
      </div>
      <form action={action} className="space-y-4">
        <Field label="Nombre y apellido">
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
          {pending ? "Creando…" : "Crear cuenta"}
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
